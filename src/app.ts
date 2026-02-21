import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { appConfig } from './config/app.config';
import { requestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { errorHandlerMiddleware } from './common/middleware/error-handler.middleware';
import { notFoundMiddleware } from './common/middleware/not-found.middleware';
import { dispatchRouter } from './modules/dispatch/dispatch.routes';
import { partnersRouter } from './modules/partners/partners.routes';
import { hubsRouter } from './modules/hubs/hubs.routes';
import { areasRouter } from './modules/areas/areas.routes';

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

  // API Routes
  app.use(`${appConfig.apiPrefix}/areas`, areasRouter);
  app.use(`${appConfig.apiPrefix}/dispatch`, dispatchRouter);
  app.use(`${appConfig.apiPrefix}/partners`, partnersRouter);
  app.use(`${appConfig.apiPrefix}/hubs`, hubsRouter);

  // 404 handler
  app.use(notFoundMiddleware);

  // Global error handler (must be last)
  app.use(errorHandlerMiddleware);

  return app;
}

export { createApp };
