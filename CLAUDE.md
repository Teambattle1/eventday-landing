# Project: EventDay Landing

Central login portal for EventDay — users enter a code and see their authorised apps/sites.

## Stack
- React 18 + Vite 5 (no Tailwind — uses CSS custom properties in `src/styles/globals.css`)
- Supabase (edge functions + Postgres, project `ilbjytyukicbssqftmma` / CrewControlCenter)
- Netlify (hosting at `app.eventday.dk` + `eventday.dk`)

## Key conventions
- Dev server: `npm run dev` on port 5180 (configured in `vite.config.js`)
- Only `git push` and deploy when explicitly told to — otherwise just commit locally
- Never deploy without explicit go-ahead
- Edge functions are deployed directly via Supabase MCP, not local CLI
- Environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) live in `.env.local` (not committed) and must be set in Netlify separately

## Architecture
- `src/Landing.jsx` — login screen + site chooser (4×3 icon grid)
- `src/AdminAccess.jsx` — admin panel at `/admin/access` for managing users, sites, and access
- `src/App.jsx` — simple pathname-based router (no react-router)
- Session persisted in localStorage (`ed_user_session`, 30-day TTL)

## User types
| Type | Source table | Code stored in |
|------|-------------|----------------|
| `employee` | `employees` | `landing_user_codes` |
| `ef_admin` | `ef_admin_users` | `ef_admin_users.code` |
| `ef_client` | `ef_clients` | `ef_clients.access_code` |
| `ef_contact` | `ef_contacts` | `ef_contacts.access_code` |
| `venue` | `locations` | `landing_user_codes` |

## Edge functions (Supabase)
- `ef-verify-code` — login: checks code across all user types, returns `user_sites` / `admin` / `client` / `redirect`
- `ef-admin-access` — admin CRUD: list users/sites, toggle access, update codes, site upsert/delete
- `ef-send-sms` — forgot-code SMS flow

## Active patterns
- Clients always use legacy portal redirect flow (never `user_sites`)
- New sites auto-grant all admin users (employees with `is_admin=true` + `ef_admin_users`)
- Icon upload resizes to 256×256 PNG via canvas before storing as data URL in `landing_sites.icon`
- "Sæt kode" button defaults to last 4 digits of phone number
- Code uniqueness checked across ALL code sources (landing_user_codes, ef_clients, ef_contacts, ef_admin_users, access_codes)

## Known issues / gotchas
- `eventday.dk` has both an A record (75.2.60.5) and a NETLIFY record pointing to this site — the A record may take priority in some DNS resolvers
- Vite HMR in dev can cause React state loss during file edits (session restored from localStorage on reload)
- `ef_client_contacts` table exists but is empty — `ef_contacts` is the active contacts table
- Maria Lund (`emp_z4ftvagjq`) was set to `is_admin=true` manually (was crew before)

## Self-maintenance instructions

After completing any significant task, automatically update this CLAUDE.md file if:
- A new pattern, convention, or architectural decision was established
- A recurring problem was solved in a way worth remembering
- A new tool, library, or integration was added to the project
- You discovered something about the codebase structure worth noting

Keep entries concise. Remove outdated entries. Never ask for permission to update this file.

## Recent decisions
- Dropped iframe/AppShell approach — external sites open via direct navigation (popups/OAuth need real browser context)
- Removed "Redirecting..." intermediate screen — clicks navigate immediately
- Intro tagline changed to "designed by TeamBattle"
- Thomas duplicate in `ef_admin_users` deleted — single source is `employees` with `is_admin=true`
