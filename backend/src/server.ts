import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import apiRoutes from './api/routes';
import { config } from './config/env.config';
import { logger } from './utils/logger.util';

export const createServer = () => {
  const app = express();

  // CORS Configuration - must be before other middleware
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl requests, or server-to-server)
      if (!origin) return callback(null, true);
      
      // Allow all origins for VAPI tool endpoints
      // VAPI makes requests from various IPs/domains that are hard to whitelist
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
  }));

  // Handle preflight requests explicitly
  app.options('*', cors());

  // Middleware
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'unsafe-none' }
  }));
  app.use(express.json());
  app.use(morgan(config.NODE_ENV === 'development' ? 'dev' : 'combined'));

  // Routes
  app.use('/api', apiRoutes);

  // Root route
  app.get('/', (req, res) => {
    res.json({ 
      service: 'Pryzm EC Backend', 
      version: '1.0.0',
      status: 'running' 
    });
  });

  // Global Error Handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled Error:', err);
    
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    
    res.status(statusCode).json({
      success: false,
      error: message,
      ...(config.NODE_ENV === 'development' && { stack: err.stack })
    });
  });

  return app;
};
