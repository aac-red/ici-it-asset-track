// ============================================================
// EDGE FUNCTION: send-email
// Deploy with: supabase functions deploy send-email
// ============================================================
import { sendEmail, emailLayout, tagChipHTML } from "../_shared/email.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const { type, to, data } = body;

    // Log the full incoming payload so we can see exactly what the frontend sent
    console.log(`[send-email] type=${type} to=${to}`);
    console.log(`[send-email] data=${JSON.stringify(data)}`);

    if (!to) {
      console.log(`[send-email] Skipped — no borrower email`);
      return new Response(JSON.stringify({ skipped: true, reason: "No recipient email on file." }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let subject = "";
    let html = "";
    let cc = undefined;

    switch (type) {
      case "issued": {
        subject = `Item issued: ${data.itemName} (${data.assetTag})`;
        html = emailLayout("Item Issued to You", `<p>Hi ${data.borrowerName},</p>
<p>The following item has been issued to you:</p>
<table style="width:100%; margin:16px 0; font-size:14px;">
<tr><td style="padding:4px 0; color:#5E5658;">Item</td><td style="padding:4px 0; font-weight:600;">${data.itemName}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Asset Tag</td><td style="padding:4px 0;">${tagChipHTML(data.assetTag)}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Due back</td><td style="padding:4px 0; font-weight:600;">${data.dueDate}</td></tr>
</table>
<p>Please return it on or before the due date. Reply to this email or contact your IT administrator with any questions.</p>`);

        // CC the issuer on issue confirmations
        if (data.issuerEmail && data.issuerEmail !== to) {
          cc = data.issuerEmail;
          console.log(`[send-email] Will CC issuer: ${cc}`);
        } else {
          console.log(`[send-email] No CC — issuerEmail="${data.issuerEmail}" to="${to}"`);
        }
        break;
      }

      case "returned": {
        subject = `Return confirmed: ${data.itemName} (${data.assetTag})`;
        html = emailLayout("Return Confirmed", `<p>Hi ${data.borrowerName},</p>
<p>This confirms we've received the following item back:</p>
<table style="width:100%; margin:16px 0; font-size:14px;">
<tr><td style="padding:4px 0; color:#5E5658;">Item</td><td style="padding:4px 0; font-weight:600;">${data.itemName}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Asset Tag</td><td style="padding:4px 0;">${tagChipHTML(data.assetTag)}</td></tr>
</table>
<p>Thanks for returning it. No further action is needed.</p>`);
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
    }

    await sendEmail({ to, cc, subject, html });

    return new Response(JSON.stringify({ sent: true, cc: cc || null }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-email] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
