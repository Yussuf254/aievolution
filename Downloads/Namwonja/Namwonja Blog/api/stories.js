// API: Stories CRUD
// GET  /api/stories?slug=...  -> list (published) or single
// POST /api/stories           -> create (admin)
// PUT  /api/stories?slug=...  -> update (admin)
// DELETE /api/stories?slug=...-> delete (admin)
const { supabase, json, readBody, isAdmin, pickOrderColumn, hasColumn } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }

  if (!supabase) {
    json(res, 500, { error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.' });
    return;
  }

  try {
    // ---- GET ----
    if (req.method === 'GET') {
      const { slug } = req.query || {};
      let query = supabase
        .from('stories')
        .select('*');

      // Only filter by is_published if the column exists (handles schemas that
      // don't track a publish flag).
      if (await hasColumn('stories', 'is_published')) {
        query = query.eq('is_published', true);
      }

      // Order by the first existing timestamp column (avoids 500s if the
      // table uses a different timestamp name).
      const orderCol = await pickOrderColumn('stories');
      if (orderCol) query = query.order(orderCol, { ascending: false });

      if (slug) {
        const { data, error } = await query.eq('slug', slug).maybeSingle();
        if (error) throw error;
        json(res, 200, data ? [data] : []);
        return;
      }

      const { data, error } = await query;
      if (error) throw error;
      json(res, 200, data || []);
      return;
    }

    // ---- POST (create) ----
    if (req.method === 'POST') {
      if (!isAdmin(req)) { json(res, 401, { error: 'Unauthorized' }); return; }
      const body = await readBody(req);
      const { slug, title, excerpt, content_html, category, cover_image, author, is_published } = body;
      if (!slug || !title) { json(res, 400, { error: 'slug and title are required' }); return; }

      const { data, error } = await supabase
        .from('stories')
        .insert([{
          slug, title, excerpt, content_html, category,
          cover_image, author: author || 'Namwonja Heritage Journal',
          is_published: is_published !== false
        }])
        .select()
        .single();
      if (error) throw error;
      json(res, 201, data);
      return;
    }

    // ---- PUT (update) ----
    if (req.method === 'PUT') {
      if (!isAdmin(req)) { json(res, 401, { error: 'Unauthorized' }); return; }
      const { slug } = req.query || {};
      if (!slug) { json(res, 400, { error: 'slug query param required' }); return; }
      const body = await readBody(req);
      const { data, error } = await supabase
        .from('stories')
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq('slug', slug)
        .select()
        .single();
      if (error) throw error;
      json(res, 200, data);
      return;
    }

    // ---- DELETE ----
    if (req.method === 'DELETE') {
      if (!isAdmin(req)) { json(res, 401, { error: 'Unauthorized' }); return; }
      const { slug } = req.query || {};
      if (!slug) { json(res, 400, { error: 'slug query param required' }); return; }
      const { error } = await supabase.from('stories').delete().eq('slug', slug);
      if (error) throw error;
      json(res, 200, { ok: true });
      return;
    }

    json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
};
