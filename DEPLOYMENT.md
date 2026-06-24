# Deploying AssetTrack to GitHub Pages

This is the final step — putting the app on a real public URL. GitHub Pages
serves static files over HTTPS, which solves the `file://` CORS problem we
hit during local testing (no Live Server needed once deployed).

---

## 1. Create a GitHub repository

1. Go to https://github.com/new
2. Name it anything, e.g. `it-asset-tracker`
3. Keep it **Public** (GitHub Pages on free accounts requires a public repo,
   unless you're on GitHub Pro/Team/Enterprise) — see the security note below
4. Don't add a README/.gitignore here — we already have files to push

## 2. Push your project to that repository

From inside your project folder, in a terminal (VS Code has one built in:
**Terminal → New Terminal**):

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/it-asset-tracker.git
git push -u origin main
```

## 3. Enable GitHub Pages

1. In your repository on GitHub, go to **Settings → Pages**
2. Under **Source**, choose **Deploy from a branch**
3. Branch: **main**, Folder: **/ (root)**
4. Click **Save**

GitHub will give you a URL like:
```
https://YOUR-USERNAME.github.io/it-asset-tracker/
```

It can take a minute or two to go live the first time.

## 4. Update Edge Function CORS (one small but important step)

Right now, the two Edge Functions that the frontend calls directly
(`send-email` and `admin-create-user`) allow requests from **any** origin
(`Access-Control-Allow-Origin: *`). That's fine for local testing, but now
that you have a real domain, it's good practice to lock it down:

In `supabase/functions/send-email/index.ts` and
`supabase/functions/admin-create-user/index.ts`, change:

```ts
"Access-Control-Allow-Origin": "*",
```
to:
```ts
"Access-Control-Allow-Origin": "https://YOUR-USERNAME.github.io",
```

Then redeploy both:
```bash
supabase functions deploy send-email
supabase functions deploy admin-create-user
```

## 5. Test the live site

Open your GitHub Pages URL and log in with your existing admin account —
everything (Supabase project, data, accounts) carries over exactly as it
was locally, since the frontend just points at the same Supabase project.

---

## ⚠️ Security note on the public repository

Your repository being "public" means **anyone can view your source code**,
including `js/shared/supabaseClient.js` with your Supabase URL and anon
key. This is **expected and safe** — the anon key is specifically designed
to be public; it has no power beyond what your RLS policies allow (see
`sql/02_rls_policies.sql`). It cannot create users, bypass roles, or read
data without a valid logged-in session.

**What must never be committed to this repository:**
- Your Gmail app password
- Your Supabase `service_role` key
- Any `.env` file containing the above

These only ever live as Supabase Edge Function secrets (set via
`supabase secrets set`), never in any file in this repo. If you ever
accidentally paste one into a file and push it, treat it as compromised —
revoke and regenerate it immediately (Gmail: regenerate the app password;
Supabase: regenerate the service_role key in Project Settings → API).

## Updating the live site later

Any time you want to change the app, edit your files locally, then:

```bash
git add .
git commit -m "Describe what changed"
git push
```

GitHub Pages redeploys automatically within a minute or two of each push.
