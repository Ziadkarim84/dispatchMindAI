import express from 'express';

let app: express.Express;
try {
  const { createApp } = require('../src/app');
  app = createApp();
} catch (err: unknown) {
  app = express();
  const e = err as Error;
  app.use((_req, res) => {
    res.status(500).json({ boot_error: e.message, stack: e.stack });
  });
}

export default app;
