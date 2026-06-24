# AssetTrack — IT Asset Borrowing System

A mobile-responsive system for tracking IT equipment loans (laptops, monitors,
cables, peripherals) — who borrowed what, when it's due, and when it's returned.

**Status: Phase 1 of 8** — Foundation, design system, auth, and shell.

---

## 🛠 Setup (do this before opening the app)

### 1. Run the SQL scripts in Supabase

Go to your Supabase project → **SQL Editor** → New query, and run these **in order**:

1. `sql/01_schema.sql` — creates all tables
2. `sql/02_rls_policies.sql` — sets up security rules

### 2. Create your first Admin user

1. In Supabase Dashboard → **Authentication → Users** → "Add user"
2. Enter an email + password (this is what you'll log in with)
3. Copy the new user's **UUID** (shown in the users list)
4. Back in **SQL Editor**, run (replace the placeholders):

```sql
insert into public.profiles (id, full_name, email, role)
values ('PASTE-USER-UUID-HERE', 'Your Name', 'your@email.com', 'admin');
```

### 3. Connect the app to your Supabase project

Open `js/shared/supabaseClient.js` and replace:

```js
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
```

with your actual values from **Project Settings → API** in Supabase.
(The `anon` key is safe to expose publicly — never use the `service_role` key here.)

### 4. Open the app

Just open `index.html` in a browser (or serve the folder with any static
server / GitHub Pages). It will redirect to `login.html` if you're not
signed in, or `dashboard.html` if you are.

---

## 📁 Project Structure

```
├── index.html              redirect entry point
├── login.html               sign-in page
├── dashboard.html            (Phase 1: placeholder, full version Phase 6)
├── css/
│   ├── tokens.css           design system variables (colors, type, spacing)
│   ├── base.css              global resets
│   ├── components.css        buttons, inputs, cards, tag-chip, badges, modal
│   ├── layout.css            app shell (sidebar/topbar/bottom-nav)
│   └── login.css             login page styles
├── js/
│   ├── auth/                 login logic + route guards
│   ├── shared/                supabase client, app shell builder, toast util
│   ├── dashboard/             dashboard page logic
│   ├── items/                 (Phase 3)
│   ├── borrowers/             (Phase 4)
│   ├── transactions/          (Phase 4)
│   └── inventory/             (Phase 8 — currently empty, reserved)
└── sql/
    ├── 01_schema.sql          table definitions
    └── 02_rls_policies.sql    security policies
```

## 🎨 Design System

- **Colors:** Innovative Controls brand — black (`#221F20`) and white base,
  brand orange (`#F68B37`) as the primary accent and asset-tag chip color,
  brand red (`#EE3233`) reserved strictly for overdue/destructive states
  (kept separate from the orange brand accent so "urgent" never competes
  visually with normal branding), green for available/success.
- **Logo:** the real Innovative Controls mark (`assets/icon-mark.png`)
  replaces the placeholder "AT" badge in the sidebar and login screen.
  `assets/company-logo.png` has the full logo with wordmark, for any
  future use (e.g. printed reports, a future PDF export).
- **Type:** Space Grotesk (headings) + Inter (body) + IBM Plex Mono (asset
  tags, serial numbers — anything ID-like).
- **Signature element:** the "tag chip" — a die-cut equipment-tag visual
  used everywhere an asset tag/ID appears, see `.tag-chip` in
  `components.css`, now in brand orange.

## 🗺 Roadmap

| Phase | Status | Scope |
|---|---|---|
| 1 | ✅ Done | Foundation, design system, auth, responsive shell |
| 3 | ✅ Done | Item management (CRUD, search, filters) |
| 4 | ✅ Done | Borrower & transaction workflow (issue/return/overdue) |
| 5 | ✅ Done | Email notifications (Gmail SMTP via Supabase Edge Functions) |
| 6 | ✅ Done | Dashboard analytics, charts, Reports + CSV export, activity log |
| 7 | ✅ Done | Admin user management UI |
| 8 | ✅ Done | QR codes, Inventory module, responsive QA, GitHub Pages deployment |

**The project is now feature-complete for v1.** See `DEPLOYMENT.md` to put it live.

## 🩹 Post-launch fixes & additions

- **Fixed:** the sidebar logout button was nearly invisible — it used a
  light-background gray that had poor contrast against the dark sidebar.
  Fixed in `css/layout.css` (`.user-chip .btn-ghost`).
- **Fixed:** `admin-create-user`'s required secret was originally named
  `SUPABASE_ANON_KEY`, which Supabase silently rejects (the `SUPABASE_`
  prefix is reserved for auto-injected values). Renamed to
  `PROJECT_ANON_KEY` — see `supabase/SETUP.md` section 7.
- **Added:** Borrowers now have **Initials** (up to 3 letters, auto-filled
  from the name if left blank — used on the avatar) and a free-text
  **Notes** field. Run `sql/05_borrower_initials_notes.sql` to add these
  columns if you already ran the original schema file.

## 📷 QR Codes (Phase 8)

Every item on the **Items** page has a QR code button. Scanning it opens
that item's record directly (deep link: `items.html?id=<itemId>`), inside
the authenticated app — there is no public/unauthenticated view, so
whoever scans it will be asked to log in if they aren't already.

- **On-screen preview** — small (96px), just enough to scan reliably
- **Print Sticker** — opens a ready-to-print single sticker (QR + asset tag
  + name) in a new tab

## 📦 Inventory (Phase 8)

The "Coming Soon" placeholder is now a real page. **Inventory** tracks the
record-keeping side of an asset — location, quantity in stock, purchase
cost/date, supplier, and warranty expiry (auto-flagged if expiring within
30 days) — separate from the day-to-day borrowing fields (status,
condition) on the Items page. Same `items` table under the hood; just a
different view onto it, so nothing needs to be kept in sync manually.

## 🚀 Deployment

See **`DEPLOYMENT.md`** for the full step-by-step GitHub Pages deployment
guide, including a security note on what must never be committed to the
repository (Gmail app password, Supabase service_role key) versus what's
safe to be public (the anon key, protected by RLS).

## 👤 Manage Users (Phase 7)

Admins can now create staff/admin accounts directly in the app — no more
manual Supabase Dashboard steps for every new hire.

- **`users.html`** — admin-only page (staff are redirected away if they try
  to visit it directly, not just hidden from nav)
- **Add User** — creates both the login (auth) account and the `profiles`
  row in one step, via the new `admin-create-user` Edge Function
- **Deactivate / Reactivate** — soft-disables an account; deactivated users
  are blocked at login but their loan history is preserved
- **Change Role** — toggle between Staff and Admin

See **`supabase/SETUP.md`** section 7 for the one-time deploy step this
phase requires (another Edge Function, same pattern as Phase 5's emails).

## ⚠️ Required migration if you already ran the SQL files before

Phase 6 found a real RLS bug: staff users couldn't see other staff members'
names in the activity feed or "Issued By" column (only admins could). Run
**`sql/04_fix_profiles_select.sql`** once in the SQL Editor to fix it — safe
to run even if you're not sure whether you're affected.

## 📊 Dashboard & Reports (Phase 6)

- **Dashboard** — live stat cards (total items, active loans, overdue,
  available), a category bar chart, a status donut chart, a "most borrowed"
  ranking, and a real-time activity feed
- **Reports** — filterable full transaction history (status, date range,
  search) with one-click **CSV export**
- **Activity log** — every create/update/delete on items, plus every
  issue/return, now writes an entry visible in the dashboard feed

## 📧 Email Notifications (Phase 5)

See **`supabase/SETUP.md`** for full deployment steps. Summary:

- **Issue / return confirmations** — sent instantly, triggered by the frontend right after a successful action (`js/shared/emailTrigger.js`)
- **Due-tomorrow reminders** and **overdue alerts** — sent once a day automatically via a scheduled Supabase Edge Function (`pg_cron`), so they fire even if nobody has the app open
- Your Gmail address + app password live only as encrypted Supabase secrets — never in this codebase
- Each transaction tracks `reminder_sent_at` / `overdue_alert_sent_at` so the daily check never double-sends

```
supabase/
├── functions/
│   ├── send-email/           on-demand: issue + return confirmations
│   ├── daily-due-check/      scheduled: reminders + overdue alerts
│   └── _shared/email.ts      shared Gmail SMTP sending logic
└── SETUP.md                  step-by-step deployment guide
```

## 🔐 Security Notes

- The frontend only ever uses the Supabase **anon** key — all access control is
  enforced server-side via Row Level Security policies (see `sql/02_rls_policies.sql`).
- Staff accounts are created manually by an admin in the Supabase Dashboard
  (no public signup). Phase 7 adds an in-app screen for this.
- The `service_role` key (needed later for email + admin user creation in
  Phase 5/7) will live only inside a Supabase Edge Function — never in this
  frontend code.
