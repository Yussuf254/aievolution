// API: Admin Dashboard data
// GET  /api/admin?type=comments       -> list all comments (pending + approved)
// GET  /api/admin?type=messages       -> list all contact messages
// GET  /api/admin?type=payments       -> list all mpesa transactions
// GET  /api/admin?type=stories        -> list all stories (incl. unpublished)
// PUT  /api/admin?type=comments&id=.. -> approve comment
// DELETE /api/admin?type=comments&id=.. -> delete comment
const { supabase, json, isAdmin, normalizeComment, pickOrderColumn, hasColumn, detectCommentApprovalColumn } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }
  if (!supabase) { json(res, 500, { error: 'Supabase not configured.' }); return; }
  if (!isAdmin(req)) { json(res, 401, { error: 'Unauthorized' }); return; }

  const { type, id } = req.query || {};

  try {
    // ---- GET ----
    if (req.method === 'GET') {
      let table;
      if (type === 'comments') table = 'comments';
      else if (type === 'messages') table = 'contact_messages';
      else if (type === 'payments') table = 'mpesa_transactions';
      else if (type === 'stories') table = 'stories';
      else { json(res, 400, { error: 'Invalid type' }); return; }

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
        // Detect the actual approval column (is_approved / approved / etc.)
        // and update it, so approve works on any live schema.
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
