const { stkQuery } = require('./_lib/mpesa');
const { supabase, json, readBody } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readBody(req);
    const { checkoutRequestId } = body;

    if (!checkoutRequestId) {
      json(res, 400, { ok: false, error: 'checkoutRequestId is required' });
      return;
    }

    const { data, status } = await stkQuery(checkoutRequestId);

    const resultCode = data?.ResultCode;
    const isSuccess = resultCode === '0' || resultCode === 0;

    let txStatus = 'pending';
    let resultDesc = data?.ResultDesc || '';

    if (isSuccess) {
      txStatus = 'success';
    } else if (resultCode === '1' || resultCode === 1) {
      txStatus = 'pending';
    } else if (resultCode !== undefined && !isSuccess) {
      txStatus = 'failed';
    }

    // If the query returned pending/failed, check the DB — the callback may
    // have already confirmed the payment (e.g. callback arrived before the query).
    if (supabase && txStatus !== 'success') {
      try {
        const { data: dbRow, error: dbErr } = await supabase
          .from('mpesa_transactions')
          .select('status, mpesa_receipt, result_desc')
          .eq('checkout_request_id', checkoutRequestId)
          .maybeSingle();
        if (!dbErr && dbRow && dbRow.status === 'success') {
          txStatus = 'success';
          resultDesc = dbRow.result_desc || resultDesc;
          // Merge the receipt into the response data so the frontend can show it.
          data.MpesaReceiptCode = dbRow.mpesa_receipt || data.MpesaReceiptCode;
        }
      } catch (dbCheckErr) {
        console.error('Failed to check DB transaction status:', dbCheckErr.message);
      }
    }

    if (supabase) {
      try {
        await supabase
          .from('mpesa_transactions')
          .update({
            status: txStatus,
            mpesa_receipt: data?.MpesaReceiptCode || null,
            result_desc: resultDesc,
          })
          .eq('checkout_request_id', checkoutRequestId);
      } catch (dbErr) {
        console.error('Failed to update transaction:', dbErr.message);
      }
    }

    if (txStatus === 'success') {
      json(res, 200, {
        ok: true,
        status: 'success',
        message: data?.CallbackMetadata?.Item || data?.MpesaReceiptCode
          ? 'Payment successful! Thank you for your support.'
          : 'Payment received. Thank you for your support.',
        data,
      });
    } else if (txStatus === 'pending') {
      json(res, 200, { ok: false, status: 'pending', message: 'Payment is still pending. Please complete the STK push on your phone.' });
    } else {
      json(res, 200, {
        ok: false,
        status: txStatus,
        error: resultDesc || data?.errorMessage || 'Payment not completed. Please try again.',
      });
    }
  } catch (err) {
    console.error('STK Query error:', err.message);
    json(res, 500, { ok: false, error: 'An error occurred while checking the payment status. Please try again.' });
  }
};
