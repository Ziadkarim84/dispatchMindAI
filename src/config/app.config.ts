import { env } from './env.validation';

const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /\.lovable\.app$/,
  /\.lovableproject\.com$/,
];

const PRODUCTION_EXACT_ORIGINS = [
  'https://redx.com.bd',
  ...(env.FRONTEND_URL ? [env.FRONTEND_URL] : []),
];

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (PRODUCTION_EXACT_ORIGINS.includes(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some(pattern => pattern.test(origin));
}

export const appConfig = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  apiPrefix: '/api/v1',
  cors: {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      const allowed = isOriginAllowed(origin);
      cb(allowed ? null : new Error(`CORS: origin not allowed — ${origin}`), allowed);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as string[],
    allowedHeaders: ['Content-Type', 'Authorization'] as string[],
  },
};
