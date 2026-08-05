// API: M-Pesa OAuth token (for debugging/verification)
const { getToken } = require('./_lib/mpesa');
const { json } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }
  try {
    const token = await getToken();
    json(res, 200, { token });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
};
