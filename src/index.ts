import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';

import { config } from '@/config/env';
import { errorHandler, notFoundHandler } from '@/middleware/errorHandler';
import routes from '@/routes';
import connectDB from '@/config/database';
import { initializeSocketHandler } from '@/socket/socketHandler';
import logger from '@/utils/logger';
import cronService from '@/services/cronService';
import backgroundWorker from '@/services/backgroundWorker';

const app = express();
const server = createServer(app);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: config.nodeEnv === 'development' ? true : config.cors.origin,
  credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes where sensitive fields should be masked
const sensitiveRoutes = ['/login', '/api/auth/login'];

// Request logging middleware
app.use((req, res, next) => {
  const now = new Date().toISOString();
  const body = { ...req.body }; // shallow copy

  // Mask password only for sensitive routes in production
  if (process.env.NODE_ENV === 'production' && sensitiveRoutes.includes(req.path)) {
    if (body.password) body.password = '[FILTERED]';
  }

  logger.debug(`${now} - ${req.method} ${req.path}`);
  logger.debug('Origin:', req.get('Origin'));
  logger.debug('Body:', body);

  next();
});

// Logging middleware
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// API routes
app.use('/api', routes);

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// 404 handler
app.use(notFoundHandler);

// Error handling middleware
app.use(errorHandler);

// Initialize Socket.IO
const socketHandler = initializeSocketHandler(server);
logger.debug('🔌 Socket handler initialized:', !!socketHandler);

// Connect to database and start server
const PORT = config.port;

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Start cron jobs
    cronService.startCronJobs();
    
    // Start background workers
    backgroundWorker.start();
    
    // Start server with port conflict handling
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Environment: ${config.nodeEnv}`);
      logger.info('🔌 Socket.IO server initialized');
    }).on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`❌ Port ${PORT} is already in use. Please kill the process using this port or use a different port.`);
        
        logger.info('💡 To kill the process, run: netstat -ano | findstr :3000');
        logger.info('💡 Then run: taskkill /PID <PID_NUMBER> /F');
        process.exit(1);
      } else {
        logger.error('Failed to start server:', err);
        process.exit(1);
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

process.on('SIGTERM', async () => {
  try {
    logger.info('🛑 Shutting down gracefulsly...');

    // Stop accepting new connections and wait for existing ones to finish
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) return reject(err);
        logger.info('HTTP server closed');
        resolve();
      });
    });

    // Stop background workers and cron jobs
    await backgroundWorker.stop?.();
    cronService.stopCronJobs?.();

    logger.info('✅ Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
});

export default app;
