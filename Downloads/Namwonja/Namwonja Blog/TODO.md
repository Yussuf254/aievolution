# TODO — Fix Donation Project Modal Save/New buttons

## Problem
- Saving a project in the donation modal gives no reply and throws back to the dashboard (native form submit → page reload).
- The "New Project" button does nothing when clicked.

## Root cause
The project modal wiring lives in `initProjects()`, which runs last in the admin.js init chain.
If it doesn't run (stale cached `admin.js?v=2.4`, or an earlier init throwing), the Save button
submits the form natively (reload → dashboard) and the New Project button has no handler.

## Steps
- [x] Bump cache-buster in `admin.html` from `js/admin.js?v=2.4` to `js/admin.js?v=2.5`
- [ ] Make project init robust: expose global `openProjectModal` / `saveProject` fallbacks
- [ ] Attach New Project button + Save Project form handlers idempotently so they always work
- [ ] Ensure `saveProject()` gives a clear success/error toast reply and reloads the projects list
- [ ] Verify syntax with `node --check`
