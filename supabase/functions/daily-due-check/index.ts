// ============================================================
// EDGE FUNCTION: daily-due-check
// Professional subject lines with reference numbers.
// Deploy: supabase functions deploy daily-due-check
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, emailLayout, tagChipHTML } from "../_shared/email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_ALERT_EMAIL = Deno.env.get("ADMIN_ALERT_EMAIL");
const PREFIX = "[ICI-IT-AssetTracker]";

Deno.serve(async (_req) => {
  console.log("[daily-due-check] Function started");
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const tomorrowDate = new Date(now);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().split("T")[0];

  console.log(`[daily-due-check] Today: ${todayStr}, Tomorrow: ${tomorrowStr}`);

  const { data: activeLoans, error } = await supabase
    .from("transactions")
    .select(`id, due_date, reminder_sent_at, overdue_alert_sent_at,
      items ( asset_tag, name ),
      borrowers ( full_name, email )`)
    .eq("status", "active");

  if (error) {
    console.error("[daily-due-check] Failed:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  console.log(`[daily-due-check] Found ${activeLoans.length} active loan(s)`);
  let remindersSent = 0, overdueAlertsSent = 0, skipped = 0;

  for (const loan of activeLoans) {
    const dueDateStr = loan.due_date;
    const borrowerEmail = loan.borrowers?.email;
    const borrowerName = loan.borrowers?.full_name || "there";
    const itemName = loan.items?.name || "Unknown item";
    const assetTag = loan.items?.asset_tag || "—";
    const ref = `TXN-${loan.id.substring(0, 8).toUpperCase()}`;
    const adminCc = (ADMIN_ALERT_EMAIL && ADMIN_ALERT_EMAIL !== borrowerEmail)
      ? ADMIN_ALERT_EMAIL : undefined;

    // ---- Due tomorrow: reminder (once) ----
    if (dueDateStr === tomorrowStr && !loan.reminder_sent_at) {
      if (!borrowerEmail) { skipped++; }
      else {
        try {
          await sendEmail({
            to: borrowerEmail, cc: adminCc,
            subject: `${PREFIX} Reminder: Item Due Tomorrow – ${assetTag} | Ref: ${ref}`,
            html: emailLayout("Item Due Tomorrow", `<p>Hi ${borrowerName},</p>
<p>This is a friendly reminder that the following item is due back <strong>tomorrow</strong>:</p>
<table style="width:100%; margin:16px 0; font-size:14px;">
<tr><td style="padding:4px 0; color:#5E5658;">Item</td><td style="padding:4px 0; font-weight:600;">${itemName}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Asset Tag</td><td style="padding:4px 0;">${tagChipHTML(assetTag)}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Due Date</td><td style="padding:4px 0; font-weight:600;">${dueDateStr}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Reference</td><td style="padding:4px 0; font-family:monospace;">${ref}</td></tr>
</table>
<p>Please return it on time, or reach out if you need an extension.</p>`),
          });
          remindersSent++;
        } catch (e) { console.error(`Reminder failed:`, e.message); }
      }
      await supabase.from("transactions").update({ reminder_sent_at: new Date().toISOString() }).eq("id", loan.id);
    }

    // ---- Due today OR overdue: alert (once) ----
    if (dueDateStr <= todayStr && !loan.overdue_alert_sent_at) {
      const isToday = dueDateStr === todayStr;
      if (!borrowerEmail && !ADMIN_ALERT_EMAIL) { skipped++; }
      else {
        try {
          await sendEmail({
            to: borrowerEmail || ADMIN_ALERT_EMAIL,
            cc: borrowerEmail ? adminCc : undefined,
            subject: isToday
              ? `${PREFIX} Item Due Today – ${assetTag} | Ref: ${ref}`
              : `${PREFIX} Overdue Notice – ${assetTag} | Ref: ${ref}`,
            html: emailLayout(isToday ? "Item Due Today" : "Item Overdue", `<p>Hi ${borrowerName},</p>
<p>The following item is ${isToday ? "due back <strong>today</strong>" : `<strong style="color:#D62A2B;">overdue</strong>`}:</p>
<table style="width:100%; margin:16px 0; font-size:14px;">
<tr><td style="padding:4px 0; color:#5E5658;">Item</td><td style="padding:4px 0; font-weight:600;">${itemName}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Asset Tag</td><td style="padding:4px 0;">${tagChipHTML(assetTag)}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Due Date</td><td style="padding:4px 0; font-weight:600;">${dueDateStr}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Reference</td><td style="padding:4px 0; font-family:monospace;">${ref}</td></tr>
</table>
<p>Please return it as soon as possible.</p>`),
          });
          overdueAlertsSent++;
        } catch (e) { console.error(`Alert failed:`, e.message); }
      }
      await supabase.from("transactions").update({ overdue_alert_sent_at: new Date().toISOString() }).eq("id", loan.id);
    }
  }

  const result = { checked: activeLoans.length, remindersSent, overdueAlertsSent, skipped };
  console.log("[daily-due-check] Done:", JSON.stringify(result));
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
});
