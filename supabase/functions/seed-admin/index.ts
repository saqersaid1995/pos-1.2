import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const adminEmail = "saqersaid@lavinderia.pos";
    const adminPassword = "455367";
    const adminUsername = "SAQERSAID";

    // Check if admin profile already exists
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", adminUsername)
      .maybeSingle();

    if (existingProfile) {
      return new Response(
        JSON.stringify({ message: "Admin user already exists", id: existingProfile.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    });

    if (authError) throw authError;

    const userId = authData.user.id;

    // Create profile
    const { error: profileError } = await supabase.from("profiles").insert({
      id: userId,
      full_name: "Saqer Said",
      username: adminUsername,
      phone: "",
      is_active: true,
    });

    if (profileError) throw profileError;

    // Assign admin role
    const { error: roleError } = await supabase.from("user_roles").insert({
      user_id: userId,
      role: "admin",
    });

    if (roleError) throw roleError;

    return new Response(
      JSON.stringify({ message: "Admin user created successfully", id: userId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
