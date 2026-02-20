import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { appConfig } from './config/app.config';
import { requestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { errorHandlerMiddleware } from './common/middleware/error-handler.middleware';
import { notFoundMiddleware } from './common/middleware/not-found.middleware';

function createApp(): Application {
  const app = express();

  // Security & parsing middleware
  app.use(helmet());
  app.use(cors(appConfig.cors));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use(requestLoggerMiddleware);

  // Health check
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes (will be added per module)
  // app.use(`${appConfig.apiPrefix}/dispatch`, dispatchRouter);
  // app.use(`${appConfig.apiPrefix}/partners`, partnerRouter);
  // app.use(`${appConfig.apiPrefix}/hubs`, hubRouter);

  // 404 handler
  app.use(notFoundMiddleware);

  // Global error handler (must be last)
  app.use(errorHandlerMiddleware);

  return app;
}

export { createApp };
