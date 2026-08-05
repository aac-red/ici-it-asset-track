// ============================================================
// EDGE FUNCTION: send-email
// Handles: issued, issued_batch, returned
// Professional subject lines with reference numbers.
// Deploy: supabase functions deploy send-email
// ============================================================
import { sendEmail, emailLayout, tagChipHTML } from "../_shared/email.ts";

const PREFIX = "[ICI-IT-AssetTracker]";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const body = await req.json();
    const { type, to, data } = body;

    console.log(`[send-email] type=${type} to=${to}`);
    console.log(`[send-email] data=${JSON.stringify(data)}`);

    if (!to) {
      return new Response(JSON.stringify({ skipped: true, reason: "No recipient email." }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let subject = "", html = "", cc = undefined;

    switch (type) {

      case "issued": {
        const ref = data.txId ? `TXN-${data.txId.substring(0, 8).toUpperCase()}` : '';
        subject = `${PREFIX} Item Issued – ${data.assetTag}${ref ? ` | Ref: ${ref}` : ''}`;
        html = emailLayout("Item Issued to You", `<p>Hi ${data.borrowerName},</p>
<p>The following item has been issued to you:</p>
<table style="width:100%; margin:16px 0; font-size:14px;">
<tr><td style="padding:4px 0; color:#5E5658;">Item</td><td style="padding:4px 0; font-weight:600;">${data.itemName}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Asset Tag</td><td style="padding:4px 0;">${tagChipHTML(data.assetTag)}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Due Back</td><td style="padding:4px 0; font-weight:600;">${data.dueDate}</td></tr>
${ref ? `<tr><td style="padding:4px 0; color:#5E5658;">Reference</td><td style="padding:4px 0; font-family:monospace;">${ref}</td></tr>` : ''}
</table>
<p>Please return it on or before the due date. Reply to this email or contact your IT administrator with any questions.</p>`);
        if (data.issuerEmail && data.issuerEmail !== to) cc = data.issuerEmail;
        break;
      }

      case "issued_batch": {
        const itemCount = data.items?.length || 0;
        const batchRef = data.batchRef || `BCH-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${new Date().toTimeString().slice(0,5).replace(':','')}`;
        subject = `${PREFIX} ${itemCount} Item${itemCount > 1 ? 's' : ''} Issued to You | Batch: ${batchRef}`;
        const itemRows = (data.items || []).map(item => `
<tr style="border-top:1px solid #E6E1DF;">
<td style="padding:8px 4px; font-weight:600;">${item.itemName}</td>
<td style="padding:8px 4px;">${tagChipHTML(item.assetTag)}</td>
<td style="padding:8px 4px; color:#5E5658;">${item.dueDate}</td>
</tr>`).join('');
        html = emailLayout(`${itemCount} Item${itemCount > 1 ? 's' : ''} Issued to You`, `<p>Hi ${data.borrowerName},</p>
<p>The following item(s) have been issued to you:</p>
<table style="width:100%; margin:16px 0; font-size:14px; border-collapse:collapse;">
<thead>
<tr style="background:#F7F5F4;">
<th style="padding:8px 4px; text-align:left; color:#5E5658; font-size:12px;">ITEM</th>
<th style="padding:8px 4px; text-align:left; color:#5E5658; font-size:12px;">ASSET TAG</th>
<th style="padding:8px 4px; text-align:left; color:#5E5658; font-size:12px;">DUE BACK</th>
</tr>
</thead>
<tbody>${itemRows}</tbody>
</table>
<p style="font-size:12px; color:#5E5658;">Batch Reference: <strong>${batchRef}</strong></p>
<p>Please return each item on or before its due date. Reply to this email or contact your IT administrator with any questions.</p>`);
        if (data.issuerEmail && data.issuerEmail !== to) cc = data.issuerEmail;
        break;
      }

      case "returned": {
        const ref = data.txId ? `TXN-${data.txId.substring(0, 8).toUpperCase()}` : '';
        subject = `${PREFIX} Return Confirmed – ${data.assetTag}${ref ? ` | Ref: ${ref}` : ''}`;
        html = emailLayout("Return Confirmed", `<p>Hi ${data.borrowerName},</p>
<p>This confirms we've received the following item back:</p>
<table style="width:100%; margin:16px 0; font-size:14px;">
<tr><td style="padding:4px 0; color:#5E5658;">Item</td><td style="padding:4px 0; font-weight:600;">${data.itemName}</td></tr>
<tr><td style="padding:4px 0; color:#5E5658;">Asset Tag</td><td style="padding:4px 0;">${tagChipHTML(data.assetTag)}</td></tr>
${ref ? `<tr><td style="padding:4px 0; color:#5E5658;">Reference</td><td style="padding:4px 0; font-family:monospace;">${ref}</td></tr>` : ''}
</table>
<p>Thanks for returning it. No further action is needed.</p>`);
        if (data.issuerEmail && data.issuerEmail !== to) cc = data.issuerEmail;
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
          status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
    }

    console.log(`[send-email] to=${to} cc=${cc || 'none'} subject="${subject}"`);
    await sendEmail({ to, cc, subject, html });

    return new Response(JSON.stringify({ sent: true, cc: cc || null }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[send-email] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
