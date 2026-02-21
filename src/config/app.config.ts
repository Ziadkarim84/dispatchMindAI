import { env } from './env.validation';

// Allow Lovable preview + localhost in non-production environments
const ALLOWED_ORIGINS_DEV = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /\.lovable\.app$/,
  /\.lovableproject\.com$/,
];

export const appConfig = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  apiPrefix: '/api/v1',
  cors: {
    origin: env.NODE_ENV === 'production'
      ? ['https://redx.com.bd']
      : (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
          // Allow requests with no origin (curl, Postman, server-to-server)
          if (!origin) return cb(null, true);
          const allowed = ALLOWED_ORIGINS_DEV.some(pattern => pattern.test(origin));
          cb(allowed ? null : new Error(`CORS: origin not allowed — ${origin}`), allowed);
        },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as string[],
    allowedHeaders: ['Content-Type', 'Authorization'] as string[],
  },
};
