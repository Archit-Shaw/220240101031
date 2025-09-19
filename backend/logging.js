// backend/logging.js
const path = require('path');
const lm = require(path.join(__dirname, '..', 'logging-middleware'));
const { requestLogger: reqLogger, logger: baseLogger, Log } = lm;

// Adapter exposes `requestLogger` and `logger` with the shape server.js expects
const logger = {
  info: (msg, meta = {}) => baseLogger.info(msg, { ...meta, stack: 'backend' }),
  debug: (msg, meta = {}) => baseLogger.debug(msg, { ...meta, stack: 'backend' }),
  warn: (msg, meta = {}) => baseLogger.info(msg, { ...meta, stack: 'backend' }), // map warn->info to keep allowed levels
  error: (msg, meta = {}) => baseLogger.error(msg, { ...meta, stack: 'backend' }),
  fatal: (msg, meta = {}) => baseLogger.fatal(msg, { ...meta, stack: 'backend' })
};

module.exports = { requestLogger: reqLogger, logger, Log, FALLBACK_FILE: lm.FALLBACK_FILE };
