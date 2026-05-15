import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).end();

    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    // Use anon key + user JWT so RLS is enforced automatically
    const supabase = createClient(
        process.env.VITE_SUPABASE_URL ?? '',
        process.env.VITE_SUPABASE_ANON_KEY ?? '',
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { subscription, action } = req.body as {
        subscription?: { endpoint: string; keys: { p256dh: string; auth: string } };
        action?: 'subscribe' | 'unsubscribe';
    };

    if (action === 'unsubscribe') {
        await supabase.from('push_subscriptions').delete().eq('user_id', user.id);
        return res.json({ ok: true });
    }

    if (!subscription?.endpoint) return res.status(400).json({ error: 'Missing subscription' });

    await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    res.json({ ok: true });
}
