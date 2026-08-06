// API: Admin data management (Authors, Contributors, Users, Roles, Settings, Audit Log)
// GET  /api/admin-data?type=authors|contributors|users|roles|settings|audit_log
// POST /api/admin-data?type=...      -> create item (or save settings)
// PUT  /api/admin-data?type=...&id=..-> update item
// DELETE /api/admin-data?type=...&id=..-> delete item
//
// Falls back gracefully: if the underlying table doesn't exist yet, returns an
// empty list for GET and an error for writes so the client can use localStorage.
const { supabase, json, readBody, isAdmin, pickOrderColumn } = require('./_lib/supabase');

const TABLE_MAP = {
  authors: 'authors',
  contributors: 'contributors',
  users: 'admin_users',
  roles: 'admin_roles',
  settings: 'site_settings',
  audit_log: 'audit_log'
};

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }
  if (!supabase) { json(res, 500, { error: 'Supabase not configured.' }); return; }
  if (!isAdmin(req)) { json(res, 401, { error: 'Unauthorized' }); return; }

  const { type, id } = req.query || {};
  const table = TABLE_MAP[type];
  if (!table) { json(res, 400, { error: 'Invalid type' }); return; }

  try {
    // ---- GET ----
    if (req.method === 'GET') {
      // Settings is a single-row store; return the first row or {}.
      if (type === 'settings') {
        const { data, error } = await supabase.from(table).select('*').limit(1).maybeSingle();
        if (error && /does not exist/i.test(error.message)) { json(res, 200, {}); return; }
        if (error) throw error;
        json(res, 200, data || {});
        return;
      }

      let query = supabase.from(table).select('*');
      const orderCol = await pickOrderColumn(table);
      if (orderCol) query = query.order(orderCol, { ascending: false });
      const { data, error } = await query;
      if (error && /does not exist/i.test(error.message)) { json(res, 200, []); return; }
      if (error) throw error;
      json(res, 200, data || []);
      return;
    }

    // ---- POST (create / save settings) ----
    if (req.method === 'POST') {
      const body = await readBody(req);

      // Settings: upsert style — store one row (id=1) with a JSON payload.
      if (type === 'settings') {
        const { data, error } = await supabase.from(table)
          .upsert({ id: 1, payload: JSON.stringify(body), updated_at: new Date().toISOString() }, { onConflict: 'id' })
          .select().single();
        if (error) throw error;
        json(res, 200, data);
        return;
      }

      const row = { ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      delete row.id; // let DB assign / keep provided id from client
      const { data, error } = await supabase.from(table).insert([row]).select().single();
      if (error) throw error;
      json(res, 201, data);
      return;
    }

    // ---- PUT (update) ----
    if (req.method === 'PUT') {
      if (!id) { json(res, 400, { error: 'id required' }); return; }
      const body = await readBody(req);
      const row = { ...body, updated_at: new Date().toISOString() };
      delete row.id;
      delete row.created_at;
      const { data, error } = await supabase.from(table).update(row).eq('id', id).select().single();
      if (error) throw error;
      json(res, 200, data);
      return;
    }

    // ---- DELETE ----
    if (req.method === 'DELETE') {
      if (!id) { json(res, 400, { error: 'id required' }); return; }
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      json(res, 200, { ok: true });
      return;
    }

    json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
};
