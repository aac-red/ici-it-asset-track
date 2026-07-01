// ============================================================
// EDGE FUNCTION: daily-due-check
// Runs once a day via pg_cron (see sql/03_email_cron.sql).
// Scans all active loans and sends:
//   - a reminder email 1 day before due_date
//   - an overdue alert the day after due_date (then stays quiet —
//     see "already notified" note below)
//
// Uses the service_role key because this runs server-side only,
// triggered by Supabase's own scheduler — it is never exposed to
// the frontend or any browser.
//
// Deploy with: supabase functions deploy daily-due-check
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, emailLayout, tagChipHTML } from "../_shared/email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_ALERT_EMAIL = Deno.env.get("ADMIN_ALERT_EMAIL"); // where overdue alerts cc to, e.g. your own Gmail

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const { data: activeLoans, error } = await supabase
    .from("transactions")
    .select(`
      id, due_date, reminder_sent_at, overdue_alert_sent_at,
      items ( asset_tag, name ),
      borrowers ( full_name, email )
    `)
    .eq("status", "active");

  if (error) {
    console.error("Failed to fetch active loans:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let remindersSent = 0;
  let overdueAlertsSent = 0;

  for (const loan of activeLoans) {
    const dueDateStr = loan.due_date; // 'YYYY-MM-DD'
    const dueDate = new Date(dueDateStr + "T00:00:00");

    // ---- Due tomorrow: send reminder (once) ----
    if (dueDateStr === tomorrowStr && !loan.reminder_sent_at) {
      if (loan.borrowers?.email) {
        try {
          await sendEmail({
            to: loan.borrowers.email,
            subject: `Reminder: ${loan.items.name} is due tomorrow`,
            html: emailLayout("Due Tomorrow", `<p>Hi ${loan.borrowers.full_name},</p>
<p>This is a friendly reminder that the following item is due back tomorrow:</p>
<table style="width:100%; margin:16px 0; font-size:14px;">
<tr><td style="padding:4px 0; color:#5E5658;">Item</td><td style="padding:4px 0; font-weight:600;">${loan.items.name}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Asset Tag</td><td style="padding:4px 0;">${tagChipHTML(loan.items.asset_tag)}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Due</td><td style="padding:4px 0; font-weight:600;">${dueDateStr}</td></tr>
</table>
<p>Please return it on time, or reach out if you need an extension.</p>`),
          });
          remindersSent++;
        } catch (e) {
          console.error(`Reminder email failed for transaction ${loan.id}:`, e.message);
        }
      }
      await supabase.from("transactions").update({ reminder_sent_at: new Date().toISOString() }).eq("id", loan.id);
    }

    // ---- Overdue: send alert (once) ----
    if (dueDate < today && !loan.overdue_alert_sent_at) {
      const recipients = [loan.borrowers?.email, ADMIN_ALERT_EMAIL].filter(Boolean);
      for (const recipient of recipients) {
        try {
          await sendEmail({
            to: recipient,
            subject: `Overdue: ${loan.items.name} (${loan.items.asset_tag})`,
            html: emailLayout("Item Overdue", `<p>Hi ${loan.borrowers?.full_name || "there"},</p>
<p>The following item is now <strong style="color:#D62A2B;">overdue</strong>:</p>
<table style="width:100%; margin:16px 0; font-size:14px;">
<tr><td style="padding:4px 0; color:#5E5658;">Item</td><td style="padding:4px 0; font-weight:600;">${loan.items.name}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Asset Tag</td><td style="padding:4px 0;">${tagChipHTML(loan.items.asset_tag)}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Was due</td><td style="padding:4px 0; font-weight:600;">${dueDateStr}</td></tr>
</table>
<p>Please return it as soon as possible.</p>`),
          });
          overdueAlertsSent++;
        } catch (e) {
          console.error(`Overdue email failed for transaction ${loan.id}:`, e.message);
        }
      }
      await supabase.from("transactions").update({ overdue_alert_sent_at: new Date().toISOString() }).eq("id", loan.id);
    }
  }

  return new Response(
    JSON.stringify({ checked: activeLoans.length, remindersSent, overdueAlertsSent }),
    { headers: { "Content-Type": "application/json" } }
  );
});
