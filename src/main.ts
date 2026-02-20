import { createApp } from './app';
import { appConfig } from './config/app.config';
import { testDatabaseConnection } from './database/connection';
import { logger } from './common/utils/logger.util';

async function bootstrap(): Promise<void> {
  try {
    await testDatabaseConnection();

    const app = createApp();

    app.listen(appConfig.port, () => {
      logger.info(`RedX Business Predictor running`, {
        port: appConfig.port,
        env: appConfig.nodeEnv,
        api: `http://localhost:${appConfig.port}${appConfig.apiPrefix}`,
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

bootstrap();
