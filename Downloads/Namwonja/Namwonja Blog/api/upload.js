// API: Image upload (admin only)
// POST /api/upload
// Body: { fileName?, data (base64), mime? }  OR  { url } to register an external URL
// Returns: { url } — public URL of the uploaded image (Supabase Storage "covers" bucket)
const { supabase, json, readBody, isAdmin } = require('./_lib/supabase');

const BUCKET = 'covers';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// Ensure the storage bucket exists (idempotent). Falls back gracefully if not possible.
async function ensureBucket() {
  try {
    const { error } = await supabase.storage.getBucket(BUCKET);
    if (error && error.message && /not found/i.test(error.message)) {
      await supabase.storage.createBucket(BUCKET, { public: true });
    } else if (error) {
      // Bucket exists or other error — try listing to confirm
      await supabase.storage.listBuckets();
    }
  } catch (e) {
    // Storage may not be enabled; the upload call will surface a clear error.
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }
  if (!supabase) { json(res, 500, { error: 'Supabase not configured.' }); return; }
  if (!isAdmin(req)) { json(res, 401, { error: 'Unauthorized' }); return; }

  if (req.method !== 'POST') { json(res, 405, { error: 'Method not allowed' }); return; }

  try {
    const body = await readBody(req);

    // Support "register external URL" shortcut (e.g. pasting an existing CDN path)
    if (body.url) {
      json(res, 200, { url: body.url });
      return;
    }

    const data = body.data;
    if (!data || typeof data !== 'string') {
      json(res, 400, { error: 'No image data provided. Send { data: "<base64>" }.' });
      return;
    }

    // Detect MIME from data URI or body.mime
    let mime = body.mime;
    if (!mime && /^data:/.test(data)) {
      mime = data.slice(5, data.indexOf(';'));
    }
    if (!mime) mime = 'image/jpeg';
    if (ALLOWED.indexOf(mime) === -1) {
      json(res, 400, { error: 'Unsupported file type. Use JPG, PNG, WebP, or GIF.' });
      return;
    }

    // Strip data URI prefix if present
    const base64 = data.indexOf(',') !== -1 ? data.slice(data.indexOf(',') + 1) : data;
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) { json(res, 400, { error: 'Empty image data.' }); return; }
    if (buffer.length > MAX_BYTES) { json(res, 400, { error: 'Image exceeds 5 MB limit.' }); return; }

    await ensureBucket();

    const ext = EXT[mime];
    const fileName = (body.fileName || 'image').replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 60);
    const stamp = Date.now();
    const path = `${stamp}-${fileName}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mime, upsert: false });

    if (error) throw error;

    const { data: pubData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    json(res, 200, { url: pubData.publicUrl });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
};

