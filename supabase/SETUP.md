# Phase 5 Setup — Email Notifications

This phase adds three emails: **issue confirmation**, **return confirmation**
(both instant), and **due-tomorrow reminder** + **overdue alert** (both sent
automatically once a day). Follow these steps in order.

---

## 1. Install the Supabase CLI (one-time, on your own computer)

```bash
npm install -g supabase
```

## 2. Log in and link your project

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
```

Find `YOUR-PROJECT-REF` in your Supabase project URL:
`https://YOUR-PROJECT-REF.supabase.co`

## 3. Set your Gmail credentials as Edge Function secrets

```bash
supabase secrets set GMAIL_USER=youraddress@gmail.com
supabase secrets set GMAIL_APP_PASSWORD=your16characterapppassword
supabase secrets set ADMIN_ALERT_EMAIL=youraddress@gmail.com
```

> These live encrypted on Supabase's servers only. They are never in any
> file in this repository and never sent to the browser.

## 4. Deploy both Edge Functions

From the project root (where the `supabase/` folder is):

```bash
supabase functions deploy send-email
supabase functions deploy daily-due-check
```

After deploying, note the function URLs shown in the terminal — you'll need
the `daily-due-check` one for step 6. It looks like:
`https://YOUR-PROJECT-REF.supabase.co/functions/v1/daily-due-check`

## 5. Run the Phase 5 SQL migration

In Supabase Dashboard → SQL Editor, open `sql/03_email_notifications.sql`,
**replace the two placeholders** (`YOUR-PROJECT-REF` and
`YOUR-SERVICE-ROLE-KEY` — found in Project Settings → API → service_role),
then run it. This adds the email-tracking columns and schedules the daily
check via `pg_cron`.

## 6. Test it

- **Issue an item** to a borrower who has an email on file → they (and you,
  if you used your own address while testing) should get an "Item Issued"
  email within a few seconds.
- **Return that item** → a "Return Confirmed" email should follow.
- For the daily reminder/overdue emails, you don't have to wait a day to
  test — you can manually trigger the function once via:

```bash
curl -X POST 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/daily-due-check' \
  -H "Authorization: Bearer YOUR-SERVICE-ROLE-KEY"
```

This will immediately check all active loans and send any reminders/alerts
that are due, exactly as the daily cron job would.

---

## How "once per loan" is enforced

Each transaction has `reminder_sent_at` and `overdue_alert_sent_at` columns.
The daily check only sends a reminder/alert if that column is still empty,
then fills it in — so re-running the function (or the daily cron firing
every day) never sends duplicate emails for the same loan.

## Gmail sending limits

A personal Gmail account can send up to ~500 emails/day via SMTP — far more
than a typical IT department's daily loan volume. If this ever becomes a
bottleneck, swapping in a dedicated provider (e.g. Resend) later only
requires changing `supabase/functions/_shared/email.ts` — nothing in the
frontend needs to change.

## 7. Deploy the admin-create-user function (Phase 7)

This function lets admins create staff/admin accounts from inside the app
instead of the Supabase Dashboard. It needs one more secret — the anon key
(the same public one already in `js/shared/supabaseClient.js`) — so the
function can verify which admin is calling it:

```bash
supabase secrets set PROJECT_ANON_KEY=your-anon-public-key
supabase functions deploy admin-create-user
```

> Note: it can't be named `SUPABASE_ANON_KEY` — Supabase reserves any
> secret name starting with `SUPABASE_` for values it injects
> automatically (like `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`,
> which is why you don't need to set those two yourself).

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available
to every Edge Function in your project — you don't need to set those
yourself.

Test it by logging in as your admin account, going to **Manage Users**, and
clicking **Add User**.

---

## Troubleshooting

- **No email arrives:** check `supabase functions logs send-email` (or
  `daily-due-check`) in the CLI for the actual error.
- **"Invalid login" from Gmail:** the app password may have been revoked or
  mistyped — regenerate one at https://myaccount.google.com/apppasswords
  (requires 2-Step Verification to be enabled on the Gmail account).
- **CORS errors in the browser console:** confirm the `send-email` function
  deployed successfully; the `Access-Control-Allow-Origin: *` header in the
  function already allows calls from any origin including GitHub Pages.
- **"Only active admins can create user accounts" when you ARE an admin:**
  double check `PROJECT_ANON_KEY` was set as a secret on the
  `admin-create-user` function (step 7) — without it, the function can't
  verify who's calling and rejects everyone.
