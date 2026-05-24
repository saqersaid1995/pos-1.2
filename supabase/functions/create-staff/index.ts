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

    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const callerToken = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: callerError } = await supabase.auth.getUser(callerToken);
    if (callerError || !caller) throw new Error("Unauthorized");

    const { data: callerRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!callerRole) throw new Error("Only admins can create staff");

    const { username, password, full_name, phone, role, action, user_id, is_active, new_password } = await req.json();

    // Handle different actions
    if (action === "update") {
      if (!user_id) throw new Error("user_id required for update");
      
      const updates: Record<string, unknown> = {};
      if (full_name !== undefined) updates.full_name = full_name;
      if (phone !== undefined) updates.phone = phone;
      if (is_active !== undefined) updates.is_active = is_active;

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from("profiles").update(updates).eq("id", user_id);
        if (error) throw error;
      }

      // Update role if changed
      if (role) {
        await supabase.from("user_roles").delete().eq("user_id", user_id);
        const { error: roleError } = await supabase.from("user_roles").insert({ user_id, role });
        if (roleError) throw roleError;
      }

      return new Response(
        JSON.stringify({ message: "Staff updated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reset-password") {
      if (!user_id || !new_password) throw new Error("user_id and new_password required");
      const { error } = await supabase.auth.admin.updateUserById(user_id, { password: new_password });
      if (error) throw error;
      return new Response(
        JSON.stringify({ message: "Password reset" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default action: create new staff
    if (!username || !password || !full_name || !role) {
      throw new Error("username, password, full_name, and role are required");
    }

    const email = `${username.toLowerCase()}@lavinderia.pos`;

    // Check if username exists
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username.toUpperCase())
      .maybeSingle();

    if (existing) throw new Error("Username already exists");

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) throw authError;

    const userId = authData.user.id;

    const { error: profileError } = await supabase.from("profiles").insert({
      id: userId,
      full_name,
      username: username.toUpperCase(),
      phone: phone || "",
      is_active: true,
    });

    if (profileError) throw profileError;

    const { error: roleError } = await supabase.from("user_roles").insert({
      user_id: userId,
      role,
    });

    if (roleError) throw roleError;

    return new Response(
      JSON.stringify({ message: "Staff created", id: userId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
