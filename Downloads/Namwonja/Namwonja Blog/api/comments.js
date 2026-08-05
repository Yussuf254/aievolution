// API: Comments
// GET  /api/comments?story=slug  -> approved comments for a story
// POST /api/comments             -> submit a comment (public)
const { supabase, json, readBody, isAdmin, detectCommentColumn, detectCommentMessageColumn, existingCommentStoryColumns, existingCommentMessageColumns, detectCommentApprovalColumn, normalizeComment, hasColumn, pickOrderColumn } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }
  if (!supabase) { json(res, 500, { error: 'Supabase not configured.' }); return; }

  try {
    // ---- GET approved comments ----
    if (req.method === 'GET') {
      const { story } = req.query || {};
      if (!story) { json(res, 400, { error: 'story query param required' }); return; }

      // Auto-detect the column that stores the story reference so this works
      // regardless of the actual Supabase schema.
      const col = await detectCommentColumn();

      let query = supabase
        .from('comments')
        .select('*')
        .eq(col, story);

      // Only filter by the approval column if it exists (avoids 500s on
      // schemas that track approval differently or not at all).
      const approvalCol = await detectCommentApprovalColumn();
      if (approvalCol) {
        query = query.eq(approvalCol, true);
      }

      // Order by the first existing timestamp column (avoids 500s if the
      // table uses a different timestamp name).
      const orderCol = await pickOrderColumn('comments');
      if (orderCol) query = query.order(orderCol, { ascending: true });

      const { data, error } = await query;
      if (error) throw error;
      json(res, 200, (data || []).map(normalizeComment));
      return;
    }

    // ---- POST comment ----
    if (req.method === 'POST') {
      const body = await readBody(req);
      const { story_slug, name, email, message } = body;
      if (!story_slug || !name || !message) {
        json(res, 400, { error: 'story_slug, name, and message are required' });
        return;
      }
      // Basic spam guard
      if (message.length > 2000 || name.length > 100) {
        json(res, 400, { error: 'Message too long' });
        return;
      }

      // Set EVERY existing story-reference and message-body column so the insert
      // never trips a NOT NULL / missing-column constraint, regardless of the
      // live schema (some tables have multiple story columns, e.g. `story` NOT
      // NULL plus `post_id`).
      const storyCols = await existingCommentStoryColumns();
      const msgCols = await existingCommentMessageColumns();
      const insertRow = {};
      storyCols.forEach(function (c) { insertRow[c] = story_slug; });
      msgCols.forEach(function (c) { insertRow[c] = message; });
      insertRow.name = name;

      // Only set email if the column exists (avoids insert 500s on schemas
      // that don't have an email column).
      if (await hasColumn('comments', 'email')) {
        insertRow.email = email || null;
      }

      // Only set the approval flag if that column exists (avoids insert 500s
      // on schemas that don't track an approval flag).
      const approvalCol = await detectCommentApprovalColumn();
      if (approvalCol) {
        insertRow[approvalCol] = false;
      }

      const { data, error } = await supabase
        .from('comments')
        .insert([insertRow])
        .select()
        .single();
      if (error) throw error;
      json(res, 201, { ...normalizeComment(data), message: 'Comment submitted for review.' });
      return;
    }

    // ---- DELETE comment (admin) ----
    if (req.method === 'DELETE') {
      if (!isAdmin(req)) { json(res, 401, { error: 'Unauthorized' }); return; }
      const { id } = req.query || {};
      if (!id) { json(res, 400, { error: 'id query param required' }); return; }
      const { error } = await supabase.from('comments').delete().eq('id', id);
      if (error) throw error;
      json(res, 200, { ok: true });
      return;
    }

    json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
};

