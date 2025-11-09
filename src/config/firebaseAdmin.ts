import admin from 'firebase-admin';
import logger from '@/utils/logger';

let firebaseApp: admin.app.App | null = null;

const normalizePrivateKey = (rawKey?: string): string | null => {
  if (!rawKey) {
    return null;
  }

  // Handle keys wrapped in quotes or containing escaped newlines
  const trimmed = rawKey.trim();
  const unwrapped = trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed;

  return unwrapped.replace(/\\n/g, '\n');
};

const buildCredential = () => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    logger.warn('⚠️  Firebase admin credentials are missing. Push notifications will be disabled.');
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
};

export const initializeFirebaseAdmin = (): admin.app.App | null => {
  if (firebaseApp) {
    return firebaseApp;
  }

  const serviceAccount = buildCredential();
  if (!serviceAccount) {
    return null;
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    logger.info('✅ Firebase admin initialized for push notifications.');
  } catch (error: any) {
    if (error?.code === 'app/duplicate-app') {
      logger.warn('⚠️  Firebase admin already initialized, reusing existing app.');
      firebaseApp = admin.apps[0] || null;
    } else {
      logger.error('❌ Failed to initialize Firebase admin:', error);
      firebaseApp = null;
    }
  }

  return firebaseApp;
};

export const getFirebaseAdmin = (): admin.app.App | null => {
  if (!firebaseApp) {
    return initializeFirebaseAdmin();
  }
  return firebaseApp;
};

export const getFirebaseMessaging = (): admin.messaging.Messaging | null => {
  const app = getFirebaseAdmin();
  if (!app) {
    return null;
  }
  return app.messaging();
};

