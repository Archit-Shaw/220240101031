// logging-middleware/index.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const LOG_ENDPOINT = 'http://20.244.56.144/evaluation-service/logs';
const FALLBACK_FILE = path.join(process.cwd(), 'app-logs.ndjson');

const ALLOWED_STACKS = new Set(['backend', 'frontend']);
const ALLOWED_LEVELS = new Set(['debug', 'info', 'error', 'fatal']);

const BACKEND_PACKAGES = new Set(['cache','controller','cron job','db','domain','handler','repository','route','service']);
const FRONTEND_PACKAGES = new Set(['api','component','hook','page','state','style']);
const BOTH_PACKAGES = new Set(['auth','config','middleware','utils']);

function normalizePackage(p) {
  if (!p) return '';
  let s = String(p).toLowerCase();
  if (s === 'cron-job' || s === 'cronjob') s = 'cron job';
  return s;
}

function validateAndNormalize(stack, level, pkg, message) {
  if (!stack || !level || !pkg) throw new Error('stack, level and package are required');
  const s = String(stack).toLowerCase();
  const l = String(level).toLowerCase();
  let p = normalizePackage(pkg);

  if (!ALLOWED_STACKS.has(s)) throw new Error(`invalid stack: ${stack}`);
  if (!ALLOWED_LEVELS.has(l)) throw new Error(`invalid level: ${level}`);

  const allowed = new Set([...BOTH_PACKAGES, ...(s === 'backend' ? [...BACKEND_PACKAGES] : []), ...(s === 'frontend' ? [...FRONTEND_PACKAGES] : [])]);
  if (!allowed.has(p)) throw new Error(`invalid package '${pkg}' for stack '${stack}'`);

  return { stack: s, level: l, package: p, message: message == null ? '' : String(message) };
}

function fallbackWrite(payload) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...payload }) + '\n';
    fs.appendFileSync(FALLBACK_FILE, line);
  } catch (e) { /* ignore */ }
}

async function Log(stack, level, pkg, message) {
  let payload;
  try {
    payload = validateAndNormalize(stack, level, pkg, message);
  } catch (err) {
    // invalid args: write to fallback for diagnostics
    fallbackWrite({ level: 'error', message: `invalid log args: ${err.message}`, meta: { stack, level, pkg, message }});
    return;
  }

  const token = process.env.LOGGING_AUTH_TOKEN || process.env.LOGGING_ACCESS_TOKEN || '';
  if (!token) {
    // no token configured -> fallback file
    fallbackWrite({ ...payload, note: 'no token configured' });
    return;
  }

  try {
    const res = await axios.post(LOG_ENDPOINT, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 4000
    });
    // also write a local record of success (optional)
    try { fs.appendFileSync(FALLBACK_FILE, JSON.stringify({ ts: new Date().toISOString(), sent: true, payload, response: res.data }) + '\n'); } catch {}
    return res.data;
  } catch (err) {
    fallbackWrite({ ...payload, remoteError: err.message || String(err) });
    return;
  }
}

const logger = {
  info: (msg, meta = {}) => Log(meta.stack || 'backend', 'info', meta.package || meta.pkg || 'middleware', msg),
  debug: (msg, meta = {}) => Log(meta.stack || 'backend', 'debug', meta.package || meta.pkg || 'middleware', msg),
  error: (msg, meta = {}) => Log(meta.stack || 'backend', 'error', meta.package || meta.pkg || 'handler', msg),
  fatal: (msg, meta = {}) => Log(meta.stack || 'backend', 'fatal', meta.package || meta.pkg || 'handler', msg)
};

function requestLogger(req, res, next) {
  const start = Date.now();
  // log start
  try { Log('backend','info','route', `${req.method} ${req.originalUrl} - start`); } catch (e) {}
  res.on('finish', () => {
    const dur = Date.now() - start;
    try { Log('backend','info','route', `${req.method} ${req.originalUrl} -> ${res.statusCode} (${dur}ms)`); } catch (e) {}
  });
  res.on('error', (err) => {
    try { Log('backend','error','route', `Response error ${req.method} ${req.originalUrl} - ${err?.message || String(err)}`); } catch (e) {}
  });
  next();
}

module.exports = { Log, logger, requestLogger, FALLBACK_FILE };
