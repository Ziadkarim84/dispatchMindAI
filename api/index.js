process.on('unhandledRejection', (reason) => {
  console.error('[serverless] Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[serverless] Uncaught exception:', err.message, err.stack);
});

let app;
try {
  const { createApp } = require('../dist/app');
  app = createApp();
  console.log('[serverless] App created successfully');
} catch (err) {
  console.error('[serverless] Boot error:', err.message);
  const express = require('express');
  app = express();
  app.use((_req, res) => {
    res.status(500).json({ boot_error: err.message, stack: err.stack });
  });
}

module.exports = (req, res) => {
  console.log('[serverless] Request:', req.method, req.url);
  app(req, res);
};
