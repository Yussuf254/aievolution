// API: Donation Projects
// GET  /api/donation-projects                  -> public: active projects only, with raised_amount
// GET  /api/donation-projects?all=1            -> admin: all projects (any status)
// POST /api/donation-projects                  -> admin: create project
// PUT  /api/donation-projects?id=..            -> admin: update project
// DELETE /api/donation-projects?id=..          -> admin: delete project
const { supabase, json, readBody, isAdmin, pickOrderColumn } = require('./_lib/supabase');

function normalizeSlug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Compute raised amount per project from successful M-Pesa transactions.
// Accepts an array of project rows and returns them with `raised_amount`
// and `donation_count` populated.
async function attachRaised(projects) {
  if (!supabase || !projects || !projects.length) return projects;
  const ids = projects.map(function (p) { return p.id; });
  const { data, error } = await supabase
    .from('mpesa_transactions')
    .select('project_id, amount, status')
    .in('project_id', ids);
  if (error) {
    console.error('Failed to compute raised amounts:', error.message);
    return projects;
  }
  var raisedMap = {};
  var countMap = {};
  (data || []).forEach(function (tx) {
    if ((tx.status || '').toLowerCase() !== 'success') return;
    var pid = tx.project_id;
    raisedMap[pid] = (raisedMap[pid] || 0) + (Number(tx.amount) || 0);
    countMap[pid] = (countMap[pid] || 0) + 1;
  });
  projects.forEach(function (p) {
    p.raised_amount = raisedMap[p.id] || 0;
    p.donation_count = countMap[p.id] || 0;
    p.progress_pct = Number(p.target_amount) > 0
      ? Math.min(100, Math.round(((p.raised_amount || 0) / Number(p.target_amount)) * 100))
      : 0;
  });
  return projects;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }
  if (!supabase) { json(res, 500, { error: 'Supabase not configured.' }); return; }

  const { id, all } = req.query || {};

  // ---- GET (public or admin) ----
  if (req.method === 'GET') {
    try {
      const wantAll = all === '1' || all === 'true';
      // Admin (any status) requires auth; public only gets active projects.
      if (wantAll && !isAdmin(req)) { json(res, 401, { error: 'Unauthorized' }); return; }

      let query = supabase.from('donation_projects').select('*');
      if (!wantAll) query = query.eq('status', 'active');
      const orderCol = await pickOrderColumn('donation_projects');
      if (orderCol) query = query.order('sort_order', { ascending: true }).order(orderCol, { ascending: false });
      const { data, error } = await query;
      if (error && /does not exist/i.test(error.message)) { json(res, 200, []); return; }
      if (error) throw error;

      const rows = await attachRaised(data || []);
      json(res, 200, rows);
    } catch (err) {
      json(res, 500, { error: err.message });
    }
    return;
  }

  // ---- Admin-only mutations ----
  if (!isAdmin(req)) { json(res, 401, { error: 'Unauthorized' }); return; }

  try {
    // ---- POST (create) ----
    if (req.method === 'POST') {
      const body = await readBody(req);
      const name = (body.name || '').trim();
      if (!name) { json(res, 400, { error: 'Project name is required' }); return; }
      let slug = (body.slug || '').trim();
      if (!slug) slug = normalizeSlug(name);
      const row = {
        name: name,
        slug: slug,
        description: (body.description || '').trim(),
        cover_image: (body.cover_image || '').trim(),
        target_amount: Number(body.target_amount) || 0,
        status: body.status || 'active',
        sort_order: Number(body.sort_order) || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const { data, error } = await supabase.from('donation_projects').insert([row]).select().maybeSingle();
      if (error) throw error;
      json(res, 201, data || {});
      return;
    }

    // ---- PUT (update) ----
    if (req.method === 'PUT') {
      if (!id) { json(res, 400, { error: 'id required' }); return; }
      const body = await readBody(req);
      const row = {
        name: (body.name || '').trim(),
        slug: (body.slug || '').trim() || normalizeSlug(body.name),
        description: (body.description || '').trim(),
        cover_image: (body.cover_image || '').trim(),
        target_amount: Number(body.target_amount) || 0,
        status: body.status || 'active',
        sort_order: Number(body.sort_order) || 0,
        updated_at: new Date().toISOString()
      };
      delete row.id;
      delete row.created_at;
      const { data, error } = await supabase.from('donation_projects').update(row).eq('id', id).select().maybeSingle();
      if (error) throw error;
      json(res, 200, data || {});
      return;
    }

    // ---- DELETE ----
    if (req.method === 'DELETE') {
      if (!id) { json(res, 400, { error: 'id required' }); return; }
      // Unlink any transactions pointing at this project before deleting it.
      await supabase.from('mpesa_transactions').update({ project_id: null }).eq('project_id', id);
      const { error } = await supabase.from('donation_projects').delete().eq('id', id);
      if (error) throw error;
      json(res, 200, { ok: true });
      return;
    }

    json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
};

