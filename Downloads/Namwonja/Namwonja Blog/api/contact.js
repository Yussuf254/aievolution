// API: Contact form
// POST /api/contact  -> save contact message
const { supabase, json, readBody } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }
  if (!supabase) { json(res, 500, { error: 'Supabase not configured.' }); return; }

  if (req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { name, email, subject, message } = body;
      const clean = {
        name: typeof name === 'string' ? name.trim() : '',
        email: typeof email === 'string' ? email.trim() : '',
        subject: typeof subject === 'string' ? subject.trim() : '',
        message: typeof message === 'string' ? message.trim() : ''
      };

      if (!clean.name || !clean.email || !clean.message) {
        json(res, 400, { error: 'name, email, and message are required' });
        return;
      }
      if (clean.name.length > 100 || clean.message.length > 5000) {
        json(res, 400, { error: 'Message is too long.' });
        return;
      }

      const { data, error } = await supabase
        .from('contact_messages')
        .insert([{
          name: clean.name,
          email: clean.email,
          subject: clean.subject,
          message: clean.message
        }])
        .select()
        .single();

      // Surface the real DB error so the frontend (and the admin) can see it
      // instead of silently swallowing the failure.
      if (error) {
        json(res, 500, { error: 'Could not save your message. ' + error.message });
        return;
      }
      json(res, 201, { ...data, message: 'Message sent successfully!' });
      return;
    } catch (err) {
      json(res, 500, { error: 'Something went wrong: ' + err.message });
      return;
    }
  }

  json(res, 405, { error: 'Method not allowed' });
};
