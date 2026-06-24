// ============================================================
// EDGE FUNCTION: send-email
// Called directly by the frontend right after a successful issue
// or return action. Expects a JSON body identifying which template
// to send and the data to fill it with.
//
// Deploy with: supabase functions deploy send-email
// ============================================================
import { sendEmail, emailLayout, tagChipHTML } from "../_shared/email.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // tighten to your GitHub Pages domain after deploying
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { type, to, data } = await req.json();

    if (!to) {
      return new Response(JSON.stringify({ skipped: true, reason: "No recipient email on file." }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let subject = "";
    let html = "";

    switch (type) {
      case "issued": {
        subject = `Item issued: ${data.itemName} (${data.assetTag})`;
        html = emailLayout("Item Issued to You", `
          <p>Hi ${data.borrowerName},</p>
          <p>The following item has been issued to you:</p>
          <table style="width:100%; margin:16px 0; font-size:14px;">
            <tr><td style="padding:4px 0; color:#5E5658;">Item</td><td style="padding:4px 0; font-weight:600;">${data.itemName}</td></tr>
            <tr><td style="padding:4px 0; color:#5E5658;">Asset Tag</td><td style="padding:4px 0;">${tagChipHTML(data.assetTag)}</td></tr>
            <tr><td style="padding:4px 0; color:#5E5658;">Due back</td><td style="padding:4px 0; font-weight:600;">${data.dueDate}</td></tr>
          </table>
          <p>Please return it on or before the due date. Reply to this email or contact your IT administrator with any questions.</p>
        `);
        break;
      }

      case "returned": {
        subject = `Return confirmed: ${data.itemName} (${data.assetTag})`;
        html = emailLayout("Return Confirmed", `
          <p>Hi ${data.borrowerName},</p>
          <p>This confirms we've received the following item back:</p>
          <table style="width:100%; margin:16px 0; font-size:14px;">
            <tr><td style="padding:4px 0; color:#5E5658;">Item</td><td style="padding:4px 0; font-weight:600;">${data.itemName}</td></tr>
            <tr><td style="padding:4px 0; color:#5E5658;">Asset Tag</td><td style="padding:4px 0;">${tagChipHTML(data.assetTag)}</td></tr>
          </table>
          <p>Thanks for returning it. No further action is needed.</p>
        `);
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
    }

    await sendEmail({ to, subject, html });

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-email error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
