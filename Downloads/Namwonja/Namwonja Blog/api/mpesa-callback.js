const { supabase, json, readBody } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readBody(req);
    console.log('[mpesa-callback] raw body keys:', Object.keys(body));

    let stkCallback = {};
    if (body && typeof body === 'object') {
      if (body.stkCallback && typeof body.stkCallback === 'object') {
        stkCallback = body.stkCallback;
      } else if (body.Body && typeof body.Body === 'object' && body.Body.stkCallback && typeof body.Body.stkCallback === 'object') {
        stkCallback = body.Body.stkCallback;
      } else if (body.raw && typeof body.raw === 'string') {
        var match = body.raw.match(/"stkCallback"\s*:\s*(\{.*?\})\s*\}\s*$/s);
        if (match) {
          try { stkCallback = JSON.parse(match[1]); } catch (e) { stkCallback = {}; }
        }
      }
    }

    const checkoutRequestId = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;
    const resultDesc = stkCallback.ResultDesc || '';

    console.log('[mpesa-callback] checkoutRequestId:', checkoutRequestId, 'resultCode:', resultCode);

    if (!checkoutRequestId) {
      json(res, 200, { message: 'No CheckoutRequestID in callback' });
      return;
    }

    let txStatus = 'pending';
    if (resultCode === 0 || resultCode === '0') {
      txStatus = 'success';
    } else if (resultCode === 1 || resultCode === '1') {
      txStatus = 'pending';
    } else {
      txStatus = 'failed';
    }

    const callbackMetadata = stkCallback?.CallbackMetadata?.Item || [];
    let mpesaReceipt = null;
    for (const item of callbackMetadata) {
      if (item.Name === 'MpesaReceiptCode') {
        mpesaReceipt = item.Value;
        break;
      }
    }

    if (supabase) {
      try {
        await supabase
          .from('mpesa_transactions')
          .update({
            status: txStatus,
            mpesa_receipt: mpesaReceipt,
            result_desc: resultDesc,
          })
          .eq('checkout_request_id', checkoutRequestId);
      } catch (dbErr) {
        console.error('Failed to update transaction from callback:', dbErr.message);
      }
    }

    json(res, 200, {
      message: resultCode === 0 || resultCode === '0'
        ? 'Payment confirmed and recorded.'
        : 'Callback received; status updated.',
    });
  } catch (err) {
    console.error('M-Pesa callback error:', err.message);
    json(res, 500, { error: 'Callback processing failed' });
  }
};
