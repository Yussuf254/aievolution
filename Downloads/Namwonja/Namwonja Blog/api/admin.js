// API: Admin Dashboard data + M-Pesa Diagnostics
// GET  /api/admin?type=comments|messages|payments|stories|mpesa-oauth-test|mpesa-transactions
// PUT  /api/admin?type=comments&id=.. -> approve comment
// DELETE /api/admin?type=comments&id=.. -> delete comment
// POST /api/admin?type=mpesa-test-stk|mpesa-simulate-callback|mpesa-offline-mode
const { supabase, json, isAdmin, normalizeComment, pickOrderColumn, hasColumn, detectCommentApprovalColumn } = require('./_lib/supabase');
const { stkPush, stkQuery, getToken } = require('./_lib/mpesa');

// In-memory offline mode toggle (resets on cold start)
let mpesaOfflineMode = false;

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }
  if (!supabase) { json(res, 500, { error: 'Supabase not configured.' }); return; }
  if (!isAdmin(req)) { json(res, 401, { error: 'Unauthorized' }); return; }

  const { type, id } = req.query || {};
  const body = req.method === 'POST' ? await readBody(req) : {};

  try {
    // ---- M-Pesa Diagnostics ----
    if (type === 'mpesa-oauth-test' && req.method === 'GET') {
      const start = Date.now();
      try {
        const token = await getToken();
        json(res, 200, { ok: true, latencyMs: Date.now() - start, tokenPrefix: token ? token.slice(0, 8) + '...' : null });
      } catch (err) {
        json(res, 200, { ok: false, latencyMs: Date.now() - start, error: err.message });
      }
      return;
    }

    if (type === 'mpesa-transactions' && req.method === 'GET') {
      let query = supabase.from('mpesa_transactions').select('*');
      const orderCol = await pickOrderColumn('mpesa_transactions');
      if (orderCol) query = query.order(orderCol, { ascending: false });
      const { data, error } = await query.limit(50);
      if (error) throw error;
      json(res, 200, data || []);
      return;
    }

    if (type === 'mpesa-test-stk' && req.method === 'POST') {
      if (mpesaOfflineMode) {
        json(res, 200, { ok: true, offline: true, message: 'Offline mode: simulated STK push success.', CheckoutRequestID: 'OFFLINE-' + Date.now() });
        return;
      }
      const { phone, amount } = body;
      if (!phone || !amount) { json(res, 400, { ok: false, error: 'phone and amount are required' }); return; }
      const numericAmount = Number(amount);
      if (isNaN(numericAmount) || numericAmount < 1) { json(res, 400, { ok: false, error: 'Invalid amount' }); return; }
      let cleanPhone = String(phone).replace(/\s+/g, '').replace(/^0/, '254');
      if (!/^2547\d{8}$/.test(cleanPhone)) { json(res, 400, { ok: false, error: 'Invalid phone format' }); return; }
      const { data, status } = await stkPush({ phone: cleanPhone, amount: numericAmount, accountRef: 'TEST-' + Date.now().toString().slice(-6) });
      if (status === 200 && data?.CheckoutRequestID) {
        json(res, 200, { ok: true, CheckoutRequestID: data.CheckoutRequestID, message: data.CustomerMessage || 'STK push sent.' });
      } else {
        json(res, 400, { ok: false, error: data?.errorMessage || data?.ResponseDescription || 'STK push failed.' });
      }
      return;
    }

    if (type === 'mpesa-simulate-callback' && req.method === 'POST') {
      const { checkoutRequestId, resultCode = 0, resultDesc = 'Simulated success' } = body;
      if (!checkoutRequestId) { json(res, 400, { ok: false, error: 'checkoutRequestId is required' }); return; }
      const txStatus = resultCode == 0 ? 'success' : (resultCode == 1 ? 'pending' : 'failed');
      if (supabase) {
        await supabase.from('mpesa_transactions').update({ status: txStatus, mpesa_receipt: 'SIM-' + Date.now().toString().slice(-6), result_desc: resultDesc }).eq('checkout_request_id', checkoutRequestId);
      }
      json(res, 200, { ok: true, message: 'Callback simulated.', status: txStatus });
      return;
    }

    if (type === 'mpesa-offline-mode' && req.method === 'POST') {
      const { enabled } = body;
      if (typeof enabled === 'boolean') {
        mpesaOfflineMode = enabled;
        json(res, 200, { ok: true, offline: mpesaOfflineMode });
      } else {
        json(res, 200, { ok: true, offline: mpesaOfflineMode });
      }
      return;
    }

    if (type === 'mpesa-offline-mode' && req.method === 'GET') {
      json(res, 200, { ok: true, offline: mpesaOfflineMode });
      return;
    }

    // ---- Standard Admin Data ----
    let table;
    if (type === 'comments') table = 'comments';
    else if (type === 'messages') table = 'contact_messages';
    else if (type === 'payments') table = 'mpesa_transactions';
    else if (type === 'stories') table = 'stories';
    else { json(res, 400, { error: 'Invalid type' }); return; }

    // ---- GET ----
    if (req.method === 'GET') {
      let query = supabase.from(table).select('*');
      const orderCol = await pickOrderColumn(table);
      if (orderCol) query = query.order(orderCol, { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      const rows = type === 'comments' ? (data || []).map(normalizeComment) : (data || []);
      json(res, 200, rows);
      return;
    }

    // ---- PUT (approve comment) ----
    if (req.method === 'PUT') {
      if (type === 'comments' && id) {
        const approvalCol = await detectCommentApprovalColumn();
        if (!approvalCol) {
          json(res, 400, { error: 'This comments table has no approval column to update.' });
          return;
        }
        const updatePayload = {};
        updatePayload[approvalCol] = true;
        const { data, error } = await supabase
          .from('comments').update(updatePayload).eq('id', id).select().maybeSingle();
        if (error) throw error;
        json(res, 200, normalizeComment(data || {}));
        return;
      }
      json(res, 400, { error: 'Invalid PUT target' });
      return;
    }

    // ---- DELETE ----
    if (req.method === 'DELETE') {
      if (type === 'comments' && id) {
        const { error } = await supabase.from('comments').delete().eq('id', id);
        if (error) throw error;
        json(res, 200, { ok: true });
        return;
      }
      json(res, 400, { error: 'Invalid DELETE target' });
      return;
    }

    json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
};
