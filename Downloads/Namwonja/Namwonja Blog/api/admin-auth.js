// API: Admin auth
// POST /api/admin-auth  -> { username, password } -> { ok, token }
// The token is a simple base64 of username:password sent as Basic auth on admin calls.
const { json, readBody } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const { username, password } = body;

    // Guard: if admin credentials are not configured, never crash —
    // return a clear 500/401 so the dashboard can show a helpful message.
    if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
      json(res, 500, { ok: false, error: 'Admin credentials are not configured on the server (ADMIN_USERNAME / ADMIN_PASSWORD).' });
      return;
    }

    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      const token = Buffer.from(`${username}:${password}`).toString('base64');
      json(res, 200, { ok: true, token });
      return;
    }
    json(res, 401, { ok: false, error: 'Invalid credentials' });
    return;
  }

  json(res, 405, { error: 'Method not allowed' });
};
