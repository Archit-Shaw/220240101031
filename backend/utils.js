// utils.js
const validator = require('validator');

function isValidUrl(s) {
  return typeof s === 'string' && validator.isURL(s, { require_protocol: true, protocols: ['http', 'https'] });
}

function normalizeShortcode(code) {
  if (!code || typeof code !== 'string') return null;
  const cleaned = code.trim();
  // allowed: letters, numbers, dash, underscore; length 3..30
  if (!/^[A-Za-z0-9_-]{3,30}$/.test(cleaned)) return null;
  return cleaned;
}

function generateShortcode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

module.exports = { isValidUrl, normalizeShortcode, generateShortcode };
