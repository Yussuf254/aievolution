# Admin Dashboard Fix Plan

## Status: Frontend fixes complete

### ✅ Completed (functional)
1. **Rich-text editor + Preview for story content**
   - WYSIWYG toolbar (`data-cmd`/`data-val`) in `admin.html`.
   - `initRTE()` in `js/admin.js` binds toolbar, syncs to hidden `#storyContent`, and toggles live preview.
   - `.rte-*` styles in `css/admin.css`.
   - Submit handler + `openStoryEditor()` sync RTE <-> textarea (payload stays `content_html`).

2. **CSV Export for Stories, Comments, Messages, Donations**
   - `Export` buttons added in `admin.html`.
   - `initExports()` + `exportCSV()` + `csvEscape()` in `js/admin.js`.
   - `.admin-btn-export` style in `css/admin.css`.

3. **Label estimated analytics honestly**
   - `.admin-est-badge` ("estimated") on "Today's Visitors" KPI with tooltip.
   - Styled via `.admin-est-badge` in `css/admin.css`.

4. **Keyboard shortcuts**
   - `initShortcuts()` in `js/admin.js`: `Ctrl+N` new story, `Ctrl+1..4` navigate.
   - `.admin-kbd` style in `css/admin.css`.

### ⏭ Remaining (backend / schema — NOT yet implemented)
5. Wire Authors/Contributors/Users/Roles to a real Supabase backend (still localStorage-only).
6. Persist Settings to Supabase so they affect the live site.
7. Add audit log table to schema.

## Follow-up
- Test the admin dashboard in the browser.
- To finish items 5–7, add Supabase tables + a new admin data API endpoint, then call it from `admin.js` (with localStorage fallback).
