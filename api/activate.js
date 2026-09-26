const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join('/tmp', 'rizxbyte-license');
const LIC_FILE = path.join(DATA_DIR, 'licenses.json');
const DEV_FILE = path.join(DATA_DIR, 'devices.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LIC_FILE)) {
    fs.writeFileSync(LIC_FILE, JSON.stringify({
      // LICENSES
    }, null, 2));
  }
  if (!fs.existsSync(DEV_FILE)) {
    fs.writeFileSync(DEV_FILE, JSON.stringify({}, null, 2));
  }
}

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const out = {};
      raw.split('&').forEach((pair) => {
        const [k, v] = pair.split('=');
        if (k) out[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' '));
      });
      if (raw.trim().startsWith('{')) {
        try { resolve(JSON.parse(raw)); return; } catch {}
      }
      resolve(out);
    });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: 0, msg: 'POST only' }));
  }

  ensureStore();
  const body = await parseBody(req);
  const key = String(body.key || '').trim().toUpperCase();
  const device = String(body.device_id || '').replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 64);

  if (!key || !device) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: 0, msg: 'missing key/device' }));
  }

  const licenses = readJSON(LIC_FILE);
  const devices = readJSON(DEV_FILE);
  const lic = licenses[key];

  if (!lic || !lic.enabled) {
    return res.end(JSON.stringify({ ok: 0, msg: 'invalid key' }));
  }

  const exp = new Date(lic.expire + 'T23:59:59Z').getTime();
  if (Number.isFinite(exp) && Date.now() > exp) {
    return res.end(JSON.stringify({ ok: 0, msg: 'expired', expire: lic.expire }));
  }

  if (!devices[key]) devices[key] = {};
  const set = devices[key];
  const max = lic.max_devices || 1;

  if (!set[device]) {
    if (Object.keys(set).length >= max) {
      return res.end(JSON.stringify({
        ok: 0,
        msg: 'max devices',
        devices: Object.keys(set).length,
        max_devices: max
      }));
    }
    set[device] = { last_seen: Date.now() };
  } else {
    set[device].last_seen = Date.now();
  }

  writeJSON(DEV_FILE, devices);

  return res.end(JSON.stringify({
    ok: 1,
    msg: 'ok',
    expire: lic.expire,
    devices: Object.keys(set).length,
    max_devices: max
  }));
};
