// M-Pesa Daraja helper functions (server-side)
const https = require('https');

// ALWAYS use the LIVE Safaricom API. This project uses live M-Pesa
// credentials, so we pin to the production endpoint regardless of any
// leftover MPESA_ENV value (e.g. 'sandbox') in the environment.
const BASE_URL = 'https://api.safaricom.co.ke';

// --- OAuth token ---
let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (!process.env.MPESA_CONSUMER_KEY || !process.env.MPESA_CONSUMER_SECRET) {
    throw new Error('M-Pesa credentials not configured. Set MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET.');
  }

  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');

  const { data, status } = await request(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` }
  });

  if (status !== 200 || !data.access_token) {
    const err = data.error || data.error_description || 'Failed to obtain OAuth token from Safaricom';
    throw new Error(`M-Pesa OAuth error: ${err}`);
  }

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // refresh 60s early
  return cachedToken;
}

// --- Generic HTTPS request helper ---
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        let data = {};
        try { data = body ? JSON.parse(body) : {}; } catch (e) { data = { raw: body }; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// --- STK Push (Lipa Na M-Pesa Online) ---
async function stkPush({ phone, amount, accountRef }) {
  const token = await getToken();
  if (!process.env.MPESA_PASSKEY || !process.env.MPESA_SHORTCODE) {
    throw new Error('M-Pesa shortcode or passkey not configured.');
  }

  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const passkey = process.env.MPESA_PASSKEY;
  const shortcode = process.env.MPESA_SHORTCODE;

  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const ref = accountRef || ('NAM' + Date.now().toString().slice(-6));

  const body = JSON.stringify({
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Number(amount),
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: process.env.MPESA_CALLBACK_URL,
    AccountReference: ref,
    TransactionDesc: 'Namwonja Heritage Journal Support'
  });

  const { data, status } = await request(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body
  });

  return { status, data };
}

// --- STK Query (check transaction status) ---
async function stkQuery(checkoutRequestId) {
  const token = await getToken();
  if (!process.env.MPESA_PASSKEY || !process.env.MPESA_SHORTCODE) {
    throw new Error('M-Pesa shortcode or passkey not configured.');
  }

  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const passkey = process.env.MPESA_PASSKEY;
  const shortcode = process.env.MPESA_SHORTCODE;
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const body = JSON.stringify({
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId
  });

  const { data, status } = await request(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body
  });

  return { status, data };
}

module.exports = { stkPush, stkQuery, getToken };
