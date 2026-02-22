// Register TypeScript path aliases (@common/*, @agents/*, @database/*, etc.)
// Vercel esbuild transpiles .ts files individually but does NOT rewrite import aliases,
// so we register tsconfig-paths at runtime to resolve them correctly.
require('tsconfig-paths/register');

let app;
try {
  const { createApp } = require('../src/app');
  app = createApp();
} catch (err) {
  const express = require('express');
  app = express();
  app.use((_req, res) => {
    res.status(500).json({ boot_error: err.message, stack: err.stack });
  });
}

module.exports = app;
