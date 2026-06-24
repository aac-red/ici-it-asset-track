// ============================================================
// SHARED EMAIL SENDER (Deno / Supabase Edge Functions)
// Uses Gmail SMTP with an app password via the `denomailer` library.
// Secrets (GMAIL_USER, GMAIL_APP_PASSWORD) are set via:
//   supabase secrets set GMAIL_USER=you@gmail.com
//   supabase secrets set GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
// These never touch the frontend — they only exist on Supabase's servers.
// ============================================================
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER");
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");

/**
 * Send an email via Gmail SMTP.
 * @param {object} params
 * @param {string} params.to - recipient email
 * @param {string} params.subject
 * @param {string} params.html - HTML body
 */
export async function sendEmail({ to, subject, html }) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD secrets are not set on this Edge Function.");
  }
  if (!to) {
    throw new Error("No recipient email provided — skipping send.");
  }

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: {
        username: GMAIL_USER,
        password: GMAIL_APP_PASSWORD,
      },
    },
  });

  await client.send({
    from: `AssetTrack <${GMAIL_USER}>`,
    to,
    subject,
    html,
  });

  await client.close();
}

/** Shared wrapper so every email looks consistent and on-brand. */
export function emailLayout(title, bodyHtml) {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #221F20;">
    <div style="background:#221F20; padding:16px 20px; border-radius:10px 10px 0 0;">
      <span style="font-weight:700; color:#F7F5F4; font-size:16px;">AssetTrack</span>
    </div>
    <div style="border:1px solid #E6E1DF; border-top:none; border-radius:0 0 10px 10px; padding:24px;">
      <h2 style="margin:0 0 12px 0; font-size:18px;">${title}</h2>
      ${bodyHtml}
    </div>
    <p style="font-size:12px; color:#948C8E; margin-top:16px; text-align:center;">
      This is an automated message from your organization's AssetTrack system.
    </p>
  </div>`;
}

export function tagChipHTML(tag) {
  return `<span style="font-family: monospace; font-weight:600; background:#F68B37; color:#6B3408; padding:2px 8px; border-radius:6px; font-size:13px;">${tag}</span>`;
}
