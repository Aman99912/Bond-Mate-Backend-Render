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

const app = express();
const server = createServer(app);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: true, // Allow all origins for development
  credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  logger.debug(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  logger.debug('Origin:', req.get('Origin'));
  logger.debug('Body:', req.body);
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
    
    // Start server with port conflict handling
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Environment: ${config.nodeEnv}`);
      logger.info(`🌐 CORS enabled for: ${config.cors.origin}`);
      logger.info('🔌 Socket.IO server initialized');
    }).on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please kill the process using this port or use a different port.`);
        console.log('💡 To kill the process, run: netstat -ano | findstr :3000');
        console.log('💡 Then run: taskkill /PID <PID_NUMBER> /F');
        process.exit(1);
      } else {
        console.error('Failed to start server:', err);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
