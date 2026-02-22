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
