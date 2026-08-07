// Shared Supabase client for serverless functions
// Uses the SERVICE ROLE key (bypasses RLS) for admin operations.
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Only create the client if env vars are present (avoids crash pre-setup)
const hasValidUrl = typeof supabaseUrl === 'string' && supabaseUrl.startsWith('http');
const hasValidKey = typeof supabaseServiceKey === 'string' && supabaseServiceKey.length > 10;
const supabase = (hasValidUrl && hasValidKey)
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

// JSON response helper
function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // Do not cache API responses: admin edits must reflect immediately on the
  // public site (Vercel may otherwise serve a stale cached payload).
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.end(JSON.stringify(data));
}

// Parse JSON body helper
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

// Simple admin auth check (Basic auth against ADMIN_USERNAME/ADMIN_PASSWORD)
function isAdmin(req) {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Basic ')) return false;
  const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
  const [user, pass] = decoded.split(':');
  return user === process.env.ADMIN_USERNAME && pass === process.env.ADMIN_PASSWORD;
}

// Cache of detected column names per table (set at runtime, survives warm invocations)
const colCache = {};

// Candidate story-reference columns for the comments table.
// Different Supabase projects may name this column differently; we auto-detect
// by probing the table with a `select(col).limit(1)` (PostgREST errors if the
// column does not exist). This makes the backend work whichever way the DB was
// set up, so comments can be posted, read, and approved reliably.
const COMMENT_STORY_COLS = [
  'story_slug',
  'post_slug',
  'article_slug',
  'story_id',
  'post_id',
  'story',
  'post',
  'article',
  'slug'
];

// Detect which column in `comments` stores the story reference.
async function detectCommentColumn() {
  if (colCache.comments) return colCache.comments;
  if (!supabase) return 'story_slug';

  for (const col of COMMENT_STORY_COLS) {
    try {
      const { error } = await supabase.from('comments').select(col).limit(1);
      if (!error) {
        colCache.comments = col;
        return col;
      }
    } catch (e) {
      // keep probing
    }
  }
  // Fallback: assume the standard name from the reference schema.
  colCache.comments = 'story_slug';
  return colCache.comments;
}

// Candidate message-body columns for the comments table. The live schema may
// name the comment body differently (e.g. `comment`, `comment_text`, `content`,
// `body`, `text`). We auto-detect so inserts never fail on a missing column.
const COMMENT_MESSAGE_COLS = [
  'message',
  'comment_text',
  'comment_body',
  'comment',
  'content',
  'body',
  'text',
  'message_text'
];

// Detect which column in `comments` stores the comment body.
async function detectCommentMessageColumn() {
  if (colCache.commentMessage) return colCache.commentMessage;
  if (!supabase) return 'message';

  for (const col of COMMENT_MESSAGE_COLS) {
    try {
      const { error } = await supabase.from('comments').select(col).limit(1);
      if (!error) {
        colCache.commentMessage = col;
        return col;
      }
    } catch (e) {
      // keep probing
    }
  }
  // Fallback: assume the standard name from the reference schema.
  colCache.commentMessage = 'message';
  return colCache.commentMessage;
}

// Return ALL comment columns that exist in the DB for the given candidate list.
// Some live schemas have multiple story-reference columns (e.g. `story` NOT NULL
// plus `post_id`), so we must set every one that exists to avoid NOT NULL errors.
async function existingCommentColumns(candidates) {
  const found = [];
  if (!supabase) return candidates.slice(0, 1);
  for (const col of candidates) {
    try {
      const { error } = await supabase.from('comments').select(col).limit(1);
      if (!error) found.push(col);
    } catch (e) {
      // keep probing
    }
  }
  return found;
}

// All existing story-reference columns in the live comments table.
async function existingCommentStoryColumns() {
  return existingCommentColumns(COMMENT_STORY_COLS);
}

// All existing message-body columns in the live comments table.
async function existingCommentMessageColumns() {
  return existingCommentColumns(COMMENT_MESSAGE_COLS);
}

// Candidate approval columns for the comments table. The live schema may use
// `is_approved` or `approved` (or `published`). We auto-detect so admin
// approve/delete and public filtered reads work on any schema.
const COMMENT_APPROVAL_COLS = ['is_approved', 'approved', 'published', 'status'];

// Detect which column in `comments` stores the approval flag.
const colCacheApproval = {};
async function detectCommentApprovalColumn() {
  if (colCacheApproval.comments) return colCacheApproval.comments;
  if (!supabase) return null;
  for (const col of COMMENT_APPROVAL_COLS) {
    try {
      const { error } = await supabase.from('comments').select(col).limit(1);
      if (!error) {
        colCacheApproval.comments = col;
        return col;
      }
    } catch (e) {
      // keep probing
    }
  }
  colCacheApproval.comments = null;
  return null;
}

// Generic probe: does `table` have `column`? (cached)
const colCache2 = {};
async function hasColumn(table, column) {
  const key = table + '.' + column;
  if (colCache2[key] !== undefined) return colCache2[key];
  if (!supabase) return true;
  try {
    const { error } = await supabase.from(table).select(column).limit(1);
    colCache2[key] = !error;
    return !error;
  } catch (e) {
    colCache2[key] = false;
    return false;
  }
}

// Pick the first *existing* timestamp column for ordering, or fall back to none.
async function pickOrderColumn(table) {
  const candidates = ['created_at', 'published_at', 'inserted_at', 'updated_at', 'id'];
  for (const col of candidates) {
    if (await hasColumn(table, col)) return col;
  }
  return null;
}

// Normalize a raw comments row so the admin dashboard / rendering code can always
// read `row.story_slug` and `row.message`, regardless of the actual DB column names.
function normalizeComment(row) {
  if (!row) return row;
  if (row.story_slug === undefined || row.story_slug === null) {
    row.story_slug = row.post_slug || row.article_slug || row.story_id || row.post_id ||
      row.story || row.post || row.article || row.slug || '—';
  }
  if (row.message === undefined || row.message === null) {
    row.message = row.comment_text || row.comment_body || row.comment ||
      row.content || row.body || row.text || row.message_text || '';
  }
  // Expose a canonical `is_approved` boolean for the admin dashboard / UI,
  // regardless of the actual column name (`approved`, `published`, etc.).
  if (row.is_approved === undefined || row.is_approved === null) {
    if (typeof row.approved === 'boolean') row.is_approved = row.approved;
    else if (typeof row.published === 'boolean') row.is_approved = row.published;
    else if (typeof row.status === 'string') row.is_approved = row.status === 'approved' || row.status === 'published';
    else row.is_approved = false;
  }
  return row;
}

module.exports = { supabase, json, readBody, isAdmin, detectCommentColumn, detectCommentMessageColumn, existingCommentStoryColumns, existingCommentMessageColumns, detectCommentApprovalColumn, normalizeComment, hasColumn, pickOrderColumn };
