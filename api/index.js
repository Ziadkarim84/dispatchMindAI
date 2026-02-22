// Entry point for Vercel serverless deployment.
// The build step (npm run build = tsc && tsc-alias) compiles src/ → dist/
// with all TypeScript path aliases (@common/*, @agents/*, etc.) rewritten
// to relative paths, so no runtime alias registration is needed.

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
