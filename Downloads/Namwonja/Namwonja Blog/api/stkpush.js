const { stkPush } = require('./_lib/mpesa');
const { supabase, json, readBody } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readBody(req);
    const { phone, amount, projectId, projectName } = body;

    if (!phone || !amount) {
      json(res, 400, { ok: false, error: 'phone and amount are required' });
      return;
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount < 1 || numericAmount > 150000) {
      json(res, 400, { ok: false, error: 'Amount must be between 1 and 150,000 KES' });
      return;
    }

    let cleanPhone = String(phone).replace(/\s+/g, '').replace(/^0/, '254');
    if (!/^2547\d{8}$/.test(cleanPhone)) {
      json(res, 400, { ok: false, error: 'Enter a valid Kenyan phone number (e.g. 2547XXXXXXXX)' });
      return;
    }

    if (!process.env.MPESA_CALLBACK_URL) {
      console.warn('[stkpush] MPESA_CALLBACK_URL is not set. Callbacks from Safaricom will not be received.');
    }

    const { data, status } = await stkPush({ phone: cleanPhone, amount: numericAmount });

    console.log('[stkpush] Safaricom response status:', status, 'data:', JSON.stringify(data));

    if (status === 200 && data && data.CheckoutRequestID) {
      const checkoutRequestId = data.CheckoutRequestID;

      const result = {
        ok: true,
        CheckoutRequestID: checkoutRequestId,
        message: data.CustomerMessage || 'STK push sent successfully. Enter your M-Pesa PIN to complete the donation.',
      };

      if (supabase) {
        try {
          await supabase.from('mpesa_transactions').insert([{
            phone: cleanPhone,
            amount: numericAmount,
            checkout_request_id: checkoutRequestId,
            status: 'pending',
            project_id: projectId || null,
            project_name: projectName || null,
          }]);
        } catch (dbErr) {
          console.error('[stkpush] Failed to record transaction:', dbErr.message);
        }
      }

      json(res, 200, result);
    } else {
      const errMsg = data?.errorMessage || data?.ResponseDescription || data?.ResponseCode || 'Could not initiate STK push. Please try again.';
      console.error('[stkpush] Safaricom error:', errMsg, 'full data:', JSON.stringify(data));
      json(res, 400, {
        ok: false,
        error: errMsg,
      });
    }
  } catch (err) {
    console.error('[stkpush] STK Push error:', err.message);
    json(res, 500, { ok: false, error: 'An error occurred while initiating the payment. Please try again.' });
  }
};
