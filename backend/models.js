// models.js
const mongoose = require('mongoose');

const ShortUrlSchema = new mongoose.Schema({
  shortcode: { type: String, required: true },
  originalUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiryAt: { type: Date, required: true, index: true },
  validityMinutes: { type: Number, default: 30 },
  clicksCount: { type: Number, default: 0 },
  metadata: { type: Object, default: {} }
}, { versionKey: false });

// ensure DB-level uniqueness
ShortUrlSchema.index({ shortcode: 1 }, { unique: true });

const ClickSchema = new mongoose.Schema({
  shortcode: { type: String, required: true, index: true },
  clickedAt: { type: Date, default: Date.now },
  referrer: { type: String, default: null },
  ip: { type: String },
  userAgent: { type: String },
  geo: { type: Object, default: {} }
}, { versionKey: false });

const ShortUrl = mongoose.model('ShortUrl', ShortUrlSchema);
const Click = mongoose.model('Click', ClickSchema);

module.exports = { ShortUrl, Click };
