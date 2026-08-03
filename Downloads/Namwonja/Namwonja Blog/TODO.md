# Task: Donate CTA — M-Pesa donation flow

## Goal
1. Add a visible "Donate" CTA on the homepage and in the main navigation
2. Create the missing `/api/stkpush` and `/api/stkquery` endpoints for M-Pesa STK push
3. Add a "Donate" link to the navigation on every page
4. Add CSS styles for `.mpesa-status` feedback messages

## Status
- [x] Created `api/stkpush.js` — initiates M-Pesa STK push and records transaction in Supabase
- [x] Created `api/stkquery.js` — polls STK status and updates transaction status in Supabase
- [x] Added `.mpesa-status` CSS rules (success/error states) to `about-magazine.css`
- [x] Added `fa-mobile` Font Awesome glyph to CSS subset
- [x] Added "Donate" link to navigation on all 14 HTML pages (index, about, category, contact, support, and all story/profile pages)
- [x] Added "Donate" CTA section on the homepage (`index.html`) with gold button linking to `support.html`
- [x] Updated footer "Explore" links on all pages to include "Donate"
- [x] `support.html` already has M-Pesa donation form with `mpesa.js` client
- [x] Deployed to Vercel: https://namwonja-heritage-journal.vercel.app

