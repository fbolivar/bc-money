import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify caller is an authenticated admin
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { action, payload } = await req.json()

    // ── Create user ──────────────────────────────────────────────────────────
    if (action === 'create_user') {
      const { email, password, full_name, role, currency } = payload

      const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      })
      if (createError) throw new Error(createError.message)

      await supabaseAdmin
        .from('profiles')
        .update({ full_name, role: role || 'user', currency: currency || 'COP' })
        .eq('id', data.user.id)

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Update user auth (email / password) ──────────────────────────────────
    if (action === 'update_user_auth') {
      const { userId, email, password, currency } = payload
      const updates: Record<string, unknown> = {}
      if (email) updates.email = email
      if (password) updates.password = password

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, updates)
        if (updateError) throw new Error(updateError.message)
      }

      if (currency) {
        await supabaseAdmin.from('profiles').update({ currency }).eq('id', userId)
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Delete user ───────────────────────────────────────────────────────────
    if (action === 'delete_user') {
      const { userId } = payload
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (deleteError) throw new Error(deleteError.message)

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
