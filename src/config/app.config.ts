import { env } from './env.validation';

export const appConfig = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  apiPrefix: '/api/v1',
  cors: {
    origin: env.NODE_ENV === 'production' ? ['https://redx.com.bd'] : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as string[],
    allowedHeaders: ['Content-Type', 'Authorization'] as string[],
  },
};
