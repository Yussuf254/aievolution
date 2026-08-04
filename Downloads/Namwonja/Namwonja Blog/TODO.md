# Task: Admin Dashboard — Full functionality + frontend linking

## Goal
1. Verify and fix the admin dashboard linking to the main website
2. Enable posting, reading, and approving comments from the admin
3. Enable uploading stories **and images** (real file upload to Supabase Storage)
4. Make the frontend display dashboard-posted stories
5. Deliver a clean, fully functional dashboard

## Status

### Step 1 — Image upload support
- [x] Create `api/upload.js` — admin-authenticated image upload to Supabase Storage bucket `covers`
- [x] Update `admin.html` story form with file input + image preview
- [x] Update `js/admin.js` to upload selected file and fill cover URL

### Step 2 — Clean dashboard rebuild
- [x] Create `css/admin.css` — branded dashboard styling using the magazine palette
- [x] Rebuild `admin.html` — header with stats row, polish tables, keep approve/delete/pub toggle
- [x] Update `js/admin.js` — actions wiring, gallery-style table polish, view story links

### Step 3 — Link admin to the frontend
- [x] Add "Admin" link to footer on all HTML pages (index, about, category, contact, support, blog, and all story/profile pages)
- [x] Add dashboard link on homepage quick access (footer + nav)

### Step 4 — Wire frontend to DB stories
- [x] Create `blog.html` — dynamic story template (reads `?slug=`, loads via `/api/stories?slug=`, renders comments)
- [x] Update `js/stories.js` — link cards to `blog.html?slug=...`, render into `#storiesGrid`, visible reveal
- [x] Update `category.html` and `index.html` — add `id="storiesGrid"` wrapper + include `js/stories.js`

### Step 5 — Schema + docs
- [x] Update `supabase-schema.sql` with storage bucket note
- [x] Update `README`/verification steps

### Step 6 — Diagnose "message not showing in admin" + harden backend
- [x] Verified prod endpoints; found `column comments.story_slug does not exist` → comments were failing to save/load because the live Supabase `comments` table uses a different story-reference column.
- [x] `api/_lib/supabase.js` — added `detectCommentColumn()` (auto-detects `story_slug`/`post_slug`/`article_slug`/`story_id`/`post_id`/`story`/`post`/`article`/`slug`) + `normalizeComment()` so the backend always exposes a `story_slug` to the admin UI.
- [x] `api/comments.js` — GET filters and POST insert now use the detected column, and rows are normalized before returning.
- [x] `api/admin.js` — comment rows are normalized so the dashboard renders the story reference reliably.
- [x] `api/stories.js` — single-story GET uses `.maybeSingle()` so missing slugs return a clean `[]` instead of a 500.
- [x] `api/admin-auth.js` — fails gracefully (no crash) when `ADMIN_USERNAME`/`ADMIN_PASSWORD` are not configured.
- [x] `js/admin.js` — client-side `storySlugFor()` helper tolerates any story-reference field when rendering comments.
- [x] Added `fix-supabase-schema.sql` — idempotent migration to add/backfill `comments.story_slug` (+ indexes, stories/contact/payments column guards).

## HOW TO COMPLETE THE FIX (2 easy steps)
### 1) Run the schema migration
Open your Supabase project → **SQL Editor** → paste the contents of **`fix-supabase-schema.sql`** → **Run**. This adds `story_slug` to the comments table (backfilling existing rows) so comments can save/display.

### 2) Redeploy to Vercel
From the project folder run:
```
npx vercel --prod --yes
```
That ships the hardened API files. (If login ever fails with "Admin credentials are not configured", re-set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in Vercel → Settings → Environment Variables, then redeploy.)

## Notes
- Supabase env vars are confirmed set in Vercel.
- Admin auth is env `ADMIN_USERNAME` / `ADMIN_PASSWORD` (Base64 Basic auth token).
- Comments now auto-detect the story column, so the dashboard works whether the DB uses `story_slug`, `post_slug`, `story_id`, `post`, etc.

