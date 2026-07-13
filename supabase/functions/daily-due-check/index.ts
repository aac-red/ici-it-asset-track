// ============================================================
// EDGE FUNCTION: daily-due-check
// Scans active loans and sends:
//   - reminder email 1 day BEFORE due_date (to borrower, CC admin)
//   - due-today / overdue alert ON or AFTER due_date (to borrower, CC admin)
// Each fires only once per transaction (tracked via sent_at columns).
// Deploy: supabase functions deploy daily-due-check
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, emailLayout, tagChipHTML } from "../_shared/email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_ALERT_EMAIL = Deno.env.get("ADMIN_ALERT_EMAIL");

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
    .select(`
      id, due_date, reminder_sent_at, overdue_alert_sent_at,
      items ( asset_tag, name ),
      borrowers ( full_name, email )
    `)
    .eq("status", "active");

  if (error) {
    console.error("[daily-due-check] Failed to fetch loans:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  console.log(`[daily-due-check] Found ${activeLoans.length} active loan(s)`);

  let remindersSent = 0;
  let overdueAlertsSent = 0;
  let skipped = 0;

  for (const loan of activeLoans) {
    const dueDateStr = loan.due_date;
    const borrowerEmail = loan.borrowers?.email;
    const borrowerName = loan.borrowers?.full_name || "there";
    const itemName = loan.items?.name || "Unknown item";
    const assetTag = loan.items?.asset_tag || "—";

    // Admin is always CC'd (if different from borrower email)
    const adminCc = (ADMIN_ALERT_EMAIL && ADMIN_ALERT_EMAIL !== borrowerEmail)
      ? ADMIN_ALERT_EMAIL
      : undefined;

    console.log(`[daily-due-check] Loan ${loan.id}: due=${dueDateStr} borrowerEmail=${borrowerEmail || "MISSING"} adminCc=${adminCc || "none (same as borrower or not set)"}`);

    // ---- Due tomorrow: reminder email (once) ----
    if (dueDateStr === tomorrowStr && !loan.reminder_sent_at) {
      if (!borrowerEmail) {
        console.log(`[daily-due-check] Skipping reminder for loan ${loan.id} — no borrower email`);
        skipped++;
      } else {
        try {
          await sendEmail({
            to: borrowerEmail,
            cc: adminCc,
            subject: `Reminder: ${itemName} is due tomorrow`,
            html: emailLayout("Due Tomorrow", `<p>Hi ${borrowerName},</p>
<p>This is a friendly reminder that the following item is due back tomorrow:</p>
<table style="width:100%; margin:16px 0; font-size:14px;">
<tr><td style="padding:4px 0; color:#5E5658;">Item</td><td style="padding:4px 0; font-weight:600;">${itemName}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Asset Tag</td><td style="padding:4px 0;">${tagChipHTML(assetTag)}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Due</td><td style="padding:4px 0; font-weight:600;">${dueDateStr}</td></tr>
</table>
<p>Please return it on time, or reach out if you need an extension.</p>`),
          });
          console.log(`[daily-due-check] Reminder sent to ${borrowerEmail} (cc: ${adminCc || "none"}) for loan ${loan.id}`);
          remindersSent++;
        } catch (e) {
          console.error(`[daily-due-check] Reminder failed for loan ${loan.id}:`, e.message);
        }
        await supabase.from("transactions")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", loan.id);
      }
    }

    // ---- Due today OR overdue: alert email (once) ----
    if (dueDateStr <= todayStr && !loan.overdue_alert_sent_at) {
      const isToday = dueDateStr === todayStr;
      const alertTitle = isToday ? "Item Due Today" : "Item Overdue";
      const alertSubject = isToday
        ? `Due today: ${itemName} (${assetTag})`
        : `Overdue: ${itemName} (${assetTag})`;

      // Send to borrower (To) with admin CC — or to admin only if no borrower email
      const to = borrowerEmail || ADMIN_ALERT_EMAIL;
      const cc = borrowerEmail ? adminCc : undefined;

      if (!to) {
        console.log(`[daily-due-check] Skipping alert for loan ${loan.id} — no emails available`);
        skipped++;
      } else {
        console.log(`[daily-due-check] Sending ${alertTitle}: to=${to} cc=${cc || "none"}`);
        try {
          await sendEmail({
            to,
            cc,
            subject: alertSubject,
            html: emailLayout(alertTitle, `<p>Hi ${borrowerName},</p>
<p>The following item is ${isToday ? "due back <strong>today</strong>" : `<strong style="color:#D62A2B;">overdue</strong>`}:</p>
<table style="width:100%; margin:16px 0; font-size:14px;">
<tr><td style="padding:4px 0; color:#5E5658;">Item</td><td style="padding:4px 0; font-weight:600;">${itemName}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Asset Tag</td><td style="padding:4px 0;">${tagChipHTML(assetTag)}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Due date</td><td style="padding:4px 0; font-weight:600;">${dueDateStr}</td></tr>
</table>
<p>Please return it as soon as possible.</p>`),
          });
          console.log(`[daily-due-check] ${alertTitle} sent for loan ${loan.id}`);
          overdueAlertsSent++;
        } catch (e) {
          console.error(`[daily-due-check] Alert failed for loan ${loan.id}:`, e.message);
        }
        await supabase.from("transactions")
          .update({ overdue_alert_sent_at: new Date().toISOString() })
          .eq("id", loan.id);
      }
    }
  }

  const result = {
    checked: activeLoans.length,
    remindersSent,
    overdueAlertsSent,
    skipped,
    todayStr,
    tomorrowStr,
  };

  console.log("[daily-due-check] Done:", JSON.stringify(result));
  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
});
