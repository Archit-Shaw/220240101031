// frontend/src/logger.js
import axios from 'axios';

const LOG_ENDPOINT = 'http://20.244.56.144/evaluation-service/logs';
const LOG_TOKEN = process.env.REACT_APP_LOGGING_AUTH_TOKEN || '';

const allowedStacks = new Set(['frontend']);
const allowedLevels = new Set(['debug','info','error','fatal']);
const allowedPackages = new Set(['api','component','hook','page','state','style','auth','config','middleware','utils']);

function validate(stack, level, pkg) {
  const s = (stack || '').toLowerCase();
  const l = (level || '').toLowerCase();
  const p = (pkg || '').toLowerCase();
  if (!allowedStacks.has(s)) throw new Error('invalid stack for frontend logger');
  if (!allowedLevels.has(l)) throw new Error('invalid level');
  if (!allowedPackages.has(p)) throw new Error('invalid package');
  return { stack: s, level: l, package: p };
}

export async function clientLog(stack='frontend', level='info', pkg='component', message='') {
  try { validate(stack, level, pkg); } catch (e) { return; }
  if (!LOG_TOKEN) return;
  try {
    await axios.post(LOG_ENDPOINT, { stack: stack.toLowerCase(), level: level.toLowerCase(), package: pkg.toLowerCase(), message }, {
      headers: { Authorization: `Bearer ${LOG_TOKEN}` }, timeout: 3000
    });
  } catch (e) { /* swallow */ }
}
