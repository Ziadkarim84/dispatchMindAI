// Prevent process crashes in serverless — log the error instead of exiting
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
} catch (err) {
  const express = require('express');
  app = express();
  app.use((_req, res) => {
    res.status(500).json({ boot_error: err.message, stack: err.stack });
  });
}

module.exports = app;
