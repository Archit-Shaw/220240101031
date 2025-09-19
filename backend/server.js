// server.js
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');

const { requestLogger, logger } = require('./logging'); // Ensure this is your pre-test logging middleware
const { ShortUrl, Click } = require('./models');
const { isValidUrl, normalizeShortcode, generateShortcode } = require('./utils');

const app = express();
app.use(helmet());
app.use(bodyParser.json());
app.use(cors({ origin: 'http://localhost:3000' })); // frontend will run on 3000

// Mandatory logging middleware
app.use(requestLogger);

// Reserved names to prevent route collisions or accidental overwrite
const RESERVED_SHORTCODES = new Set(['shorturls', 'api', 'admin', 'health', 'favicon.ico']);

// Health endpoint
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// DB connection - configure via MONGODB_URI env var
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/urlshortener';

mongoose.connect(MONGODB_URI).catch(err => {
  // log initial connection error (don't throw)
  logger.error('Initial MongoDB connection failed', { package: 'db', error: err?.message || String(err) });
});

mongoose.connection.on('error', err =>
  logger.error('MongoDB connection error', { package: 'db', error: err?.message || String(err) })
);

mongoose.connection.once('open', () =>
  logger.info('MongoDB connected', { package: 'db' })
);


/**
 * Helper to ensure unique shortcode (tries to generate if not provided)
 */
async function makeUniqueShortcode(desired) {
  if (desired) {
    const normalized = desired.toString().trim();
    if (RESERVED_SHORTCODES.has(normalized.toLowerCase())) {
      throw { status: 400, message: 'shortcode not allowed' };
    }
    const existing = await ShortUrl.findOne({ shortcode: normalized }).lean();
    if (existing) throw { status: 409, message: 'shortcode already exists' };
    return normalized;
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = generateShortcode(6);
    if (RESERVED_SHORTCODES.has(candidate.toLowerCase())) continue;
    const exists = await ShortUrl.findOne({ shortcode: candidate }).lean();
    if (!exists) return candidate;
  }
  throw { status: 500, message: 'unable to generate unique shortcode, try again' };
}

/**
 * POST /shorturls -> create short url
 */
app.post('/shorturls', async (req, res) => {
  try {
    const { url, validity, shortcode } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required and must be a string' });
    }
    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'url must include protocol (http/https) and be a valid URL' });
    }

    const validMinutes = Number.isInteger(Number(validity)) && Number(validity) > 0 ? Number(validity) : 30;
    if (validMinutes <= 0) return res.status(400).json({ error: 'validity must be a positive integer (minutes)' });

    let chosen = null;
    if (shortcode) {
      const normalized = normalizeShortcode(shortcode);
      if (!normalized) return res.status(400).json({ error: 'invalid shortcode — only A-Z a-z 0-9 _ - allowed, length 3..30' });
      chosen = await makeUniqueShortcode(normalized);
    } else {
      chosen = await makeUniqueShortcode(null);
    }

    const now = new Date();
    const expiryAt = new Date(now.getTime() + validMinutes * 60000);

    // Attempt to save with retry for race conditions (duplicate key)
    let savedDoc = null;
    let lastSaveErr = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        savedDoc = await new ShortUrl({
          shortcode: chosen,
          originalUrl: url,
          createdAt: now,
          expiryAt,
          validityMinutes: validMinutes,
          metadata: { createdFromIP: req.ip, userAgent: req.get('User-Agent') }
        }).save();
        lastSaveErr = null;
        break;
      } catch (e) {
        lastSaveErr = e;
        // duplicate key error -> choose a new shortcode and retry
        if (e && e.code === 11000) {
          logger.warn('Duplicate key on save - shortcode collision, regenerating', { package: 'db', error: e?.message || String(e) });
          chosen = await makeUniqueShortcode(null);
          continue;
        }
        // other errors -> break out to outer catch
        break;
      }
    }

    if (!savedDoc) {
      logger.error('Failed to save ShortUrl after retries', { package: 'db', error: lastSaveErr?.message || String(lastSaveErr) });
      return res.status(500).json({ error: 'internal server error' });
    }

    // Build shortLink using BASE_URL if provided (useful behind proxies)
    const base = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    logger.info('Shortlink created', { package: 'handler', shortcode: chosen, originalUrl: url, expiryAt: expiryAt.toISOString() });

    return res.status(201).json({
      shortLink: `${base}/${chosen}`,
      expiry: expiryAt.toISOString()
    });
  } catch (err) {
    logger.error('create shorturl error', { package: 'handler', error: err?.message || String(err) });
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: 'internal server error' });
  }
});

/**
 * GET /shorturls/:shortcode -> stats
 */
app.get('/shorturls/:shortcode', async (req, res) => {
  try {
    const sc = req.params.shortcode;
    const doc = await ShortUrl.findOne({ shortcode: sc }).lean();
    if (!doc) {
      logger.warn('stats_not_found', { package: 'route', shortcode: sc });
      return res.status(404).json({ error: 'shortcode not found' });
    }

    const clicks = await Click.find({ shortcode: sc }).sort({ clickedAt: -1 }).lean();

    const clickDetails = clicks.map(c => ({
      timestamp: c.clickedAt,
      referrer: c.referrer,
      ip: c.ip,
      userAgent: c.userAgent,
      geo: c.geo || {}
    }));

    return res.json({
      shortcode: sc,
      originalUrl: doc.originalUrl,
      createdAt: doc.createdAt,
      expiryAt: doc.expiryAt,
      clicksTotal: doc.clicksCount,
      clicks: clickDetails
    });
  } catch (err) {
    logger.error('stats error', { package: 'handler', error: err?.message || String(err) });
    return res.status(500).json({ error: 'internal server error' });
  }
});

/**
 * GET /shorturls -> list (useful for frontend)
 */
app.get('/shorturls', async (req, res) => {
  try {
    const docs = await ShortUrl.find({}).sort({ createdAt: -1 }).limit(100).lean();
    const base = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const out = docs.map(d => ({
      shortcode: d.shortcode,
      shortLink: `${base}/${d.shortcode}`,
      originalUrl: d.originalUrl,
      createdAt: d.createdAt,
      expiryAt: d.expiryAt,
      clicksTotal: d.clicksCount
    }));
    return res.json(out);
  } catch (err) {
    logger.error('list shorturls error', { package: 'handler', error: err?.message || String(err) });
    return res.status(500).json({ error: 'internal server error' });
  }
});

/**
 * GET /:shortcode -> redirect
 * NOTE: This route is intentionally placed AFTER the /shorturls routes to avoid collisions.
 */
app.get('/:shortcode', async (req, res) => {
  try {
    const sc = req.params.shortcode;

    // protect reserved shortcodes explicitly
    if (RESERVED_SHORTCODES.has(sc.toLowerCase())) {
      logger.warn('redirect_attempt_reserved_shortcode', { package: 'route', shortcode: sc });
      return res.status(404).json({ error: 'shortcode not found' });
    }

    const doc = await ShortUrl.findOne({ shortcode: sc });
    if (!doc) {
      logger.warn('redirect_not_found', { package: 'route', shortcode: sc });
      return res.status(404).json({ error: 'shortcode not found' });
    }
    const now = new Date();
    if (now > doc.expiryAt) {
      logger.info('redirect_expired', { package: 'route', shortcode: sc, expiryAt: doc.expiryAt.toISOString() });
      return res.status(410).json({ error: 'shortcode expired' });
    }

    // record click
    const click = new Click({
      shortcode: sc,
      referrer: req.get('Referer') || null,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      geo: { country: null } // optionally enhance via GeoIP
    });
    await click.save();

    // atomic increment
    await ShortUrl.updateOne({ shortcode: sc }, { $inc: { clicksCount: 1 } });

    logger.info('redirect', { package: 'route', shortcode: sc, to: doc.originalUrl });

    return res.redirect(302, doc.originalUrl);
  } catch (err) {
    logger.error('redirect error', { package: 'route', error: err?.message || String(err) });
    return res.status(500).json({ error: 'internal server error' });
  }
});

// global error handler fallback
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { package: 'handler', error: err?.message || String(err) });
  res.status(500).json({ error: 'internal server error' });
});

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  logger.info('SIGINT received — shutting down', { package: 'system' });
  try { await mongoose.disconnect(); } catch (e) { /* ignore */ }
  process.exit(0);
});
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down', { package: 'system' });
  try { await mongoose.disconnect(); } catch (e) { /* ignore */ }
  process.exit(0);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => logger.info(`URL Shortener microservice listening on port ${PORT}`, { package: 'system', port: PORT }));
