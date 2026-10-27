# ProShield Time Tracker

A simple clock-in / clock-out web app for the team, with a manager dashboard.
Built as static HTML pages on top of Supabase (auth + Postgres database).

## Live sites (Netlify)
- Tracker (team): https://proshield-timetracker.netlify.app  — source: `index.html`
- Dashboard (managers): https://proshield-dashboard.netlify.app  — source: `dashboard.html`

## Files
| File | What it is |
|------|------------|
| `index.html` | The tracker. Team sign in, Start/Stop work, note what they did. Managers also get Team + Tasks tabs. |
| `dashboard.html` | Manager-only monthly hours dashboard (charts), reads the same Supabase DB. |
| `supabase-schema.sql` | Database schema + row-level security. Run once in Supabase SQL editor. |
| `supabase/functions/clickup-tasks/index.ts` | Edge Function that pulls ClickUp tasks for the manager Tasks tab. Needs a `CLICKUP_TOKEN` secret. |

## Backend
- Supabase project (URL + anon/publishable key are set near the top of `index.html` and `dashboard.html`).
- Auth: email + password. Managers are flagged via `profiles.is_manager`.

## Deploy
Both HTML pages are plain static files — deploy to Netlify (drag-and-drop or Git).
`index.html` → the tracker site; `dashboard.html` → the dashboard site.

## Requested change
Add a **Pause / Resume** control to the running timer on the tracker
(currently it only has Start work / Stop work).
