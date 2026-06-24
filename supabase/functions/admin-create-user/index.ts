// ============================================================
// EDGE FUNCTION: admin-create-user
// Allows an admin to create a new staff/admin account in-app,
// without touching the Supabase Dashboard.
//
// SECURITY MODEL:
//   1. The caller's own session JWT (sent as the Authorization
//      header by the frontend's supabase-js client automatically)
//      is verified first, using the ANON key client — this tells
//      us who is calling, honoring normal RLS.
//   2. We then check that caller's profile row has role = 'admin'.
//      If not, we reject before touching anything else.
//   3. Only AFTER that check passes do we use the service_role
//      key to actually create the new auth user + profile row.
//
// The service_role key never leaves this server-side function.
//
// Deploy with: supabase functions deploy admin-create-user
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const ANON_KEY = Deno.env.get("PROJECT_ANON_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // tighten to your GitHub Pages domain after deploying
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header." }, 401);
    }

    // ---- Step 1: identify the caller using their own JWT ----
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData?.user) {
      return jsonResponse({ error: "Could not verify caller identity." }, 401);
    }

    // ---- Step 2: confirm caller is an active admin ----
    const { data: callerProfile, error: profileError } = await callerClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", callerData.user.id)
      .single();

    if (profileError || !callerProfile || callerProfile.role !== "admin" || !callerProfile.is_active) {
      return jsonResponse({ error: "Only active admins can create user accounts." }, 403);
    }

    // ---- Step 3: validate the new-user payload ----
    const { email, password, fullName, role, department } = await req.json();

    if (!email || !password || !fullName) {
      return jsonResponse({ error: "Email, password, and full name are required." }, 400);
    }
    if (password.length < 6) {
      return jsonResponse({ error: "Password must be at least 6 characters." }, 400);
    }
    if (!["admin", "staff"].includes(role)) {
      return jsonResponse({ error: "Role must be 'admin' or 'staff'." }, 400);
    }

    // ---- Step 4: create the auth user + profile, using service_role ----
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip email verification — admin is vouching for this account
    });

    if (createError) {
      return jsonResponse({ error: createError.message }, 400);
    }

    const { error: insertProfileError } = await adminClient.from("profiles").insert([{
      id: newUser.user.id,
      full_name: fullName,
      email,
      role,
      department: department || null,
    }]);

    if (insertProfileError) {
      // Roll back the auth user so we don't leave an orphaned login
      // with no profile (which would otherwise fail to log in anyway).
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      return jsonResponse({ error: `Could not create profile: ${insertProfileError.message}` }, 500);
    }

    return jsonResponse({ success: true, userId: newUser.user.id });
  } catch (err) {
    console.error("admin-create-user error:", err);
    return jsonResponse({ error: err.message }, 500);
  }
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
