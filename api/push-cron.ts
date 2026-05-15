import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

webpush.setVapidDetails(
    'mailto:soporte@bc-security.com',
    process.env.VAPID_PUBLIC_KEY ?? '',
    process.env.VAPID_PRIVATE_KEY ?? '',
);

const supabase = createClient(
    process.env.VITE_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
);

interface PushSub { user_id: string; endpoint: string; p256dh: string; auth: string }

async function sendPush(sub: PushSub, payload: object) {
    try {
        await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
        );
    } catch { /* subscription expired or invalid — ignore */ }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Vercel cron sends GET; also allow POST for manual trigger
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

    const { data: subs } = await supabase.from('push_subscriptions').select('*');
    if (!subs?.length) return res.json({ sent: 0 });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    let sent = 0;

    for (const sub of subs as PushSub[]) {
        const userId = sub.user_id;

        // Fetch user profile for alert thresholds
        const { data: profile } = await supabase.from('profiles').select('alert_budget_pct, alert_debt_days, alert_warranty_days, alerts_enabled').eq('id', userId).single();
        if (!profile?.alerts_enabled) continue;

        const notifications: object[] = [];

        // Budget alerts
        const { data: budgets } = await supabase.from('budgets').select('*, categories(name)').eq('user_id', userId);
        if (budgets?.length) {
            const { data: expenses } = await supabase.from('transactions').select('amount, category_id').eq('user_id', userId).eq('type', 'expense').gte('date', monthStart).lte('date', monthEnd);
            for (const b of budgets) {
                const spent = (expenses ?? []).filter(e => e.category_id === b.category_id).reduce((s, e) => s + Number(e.amount), 0);
                const pct = (spent / Number(b.amount)) * 100;
                if (pct >= (profile.alert_budget_pct ?? 80)) {
                    const catName = (b.categories as { name?: string } | null)?.name ?? 'Presupuesto';
                    notifications.push({
                        title: '⚠️ Presupuesto al límite',
                        body: `${catName}: ${pct.toFixed(0)}% usado este mes`,
                        url: '/presupuestos',
                    });
                }
            }
        }

        // Debt payment alerts
        const { data: debts } = await supabase.from('debts').select('name, payment_day').eq('user_id', userId).eq('status', 'active');
        const alertDays = profile.alert_debt_days ?? 3;
        for (const d of (debts ?? [])) {
            if (!d.payment_day) continue;
            const payDate = new Date(now.getFullYear(), now.getMonth(), d.payment_day);
            const daysLeft = Math.ceil((payDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysLeft >= 0 && daysLeft <= alertDays) {
                notifications.push({
                    title: '💳 Pago próximo',
                    body: `${d.name} vence en ${daysLeft === 0 ? 'hoy' : `${daysLeft} día(s)`}`,
                    url: '/deudas',
                });
            }
        }

        // Warranty alerts
        const { data: warranties } = await supabase.from('warranties').select('product_name, warranty_end_date').eq('user_id', userId).eq('status', 'active');
        const warnDays = profile.alert_warranty_days ?? 30;
        for (const w of (warranties ?? [])) {
            const expDate = new Date(w.warranty_end_date);
            const daysLeft = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysLeft >= 0 && daysLeft <= warnDays) {
                notifications.push({
                    title: '🛡️ Garantía por vencer',
                    body: `${w.product_name} vence en ${daysLeft} día(s)`,
                    url: '/garantias',
                });
            }
        }

        // Subscription alerts (próximos 3 días)
        const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        const todayStr = now.toISOString().slice(0, 10);
        const threeDaysStr = threeDays.toISOString().slice(0, 10);
        const { data: suscripciones } = await supabase
            .from('subscriptions')
            .select('name, next_billing_date, amount, currency')
            .eq('user_id', userId)
            .eq('status', 'active')
            .gte('next_billing_date', todayStr)
            .lte('next_billing_date', threeDaysStr);
        for (const s of (suscripciones ?? [])) {
            const daysLeft = Math.ceil((new Date(s.next_billing_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            notifications.push({
                title: '🔄 Suscripción por renovar',
                body: daysLeft === 0
                    ? `${s.name} se cobra hoy`
                    : `${s.name} se cobra en ${daysLeft} día(s)`,
                url: '/suscripciones',
            });
        }

        // Metas near completion (≥90%)
        const { data: goals } = await supabase
            .from('goals')
            .select('name, current_amount, target_amount')
            .eq('user_id', userId)
            .eq('status', 'active');
        for (const g of (goals ?? [])) {
            const pct = Number(g.target_amount) > 0 ? (Number(g.current_amount) / Number(g.target_amount)) * 100 : 0;
            if (pct >= 90 && pct < 100) {
                notifications.push({
                    title: '🎯 Meta casi alcanzada',
                    body: `"${g.name}" está al ${pct.toFixed(0)}% — ¡ya casi!`,
                    url: '/metas',
                });
            } else if (pct >= 100) {
                notifications.push({
                    title: '🎉 Meta alcanzada',
                    body: `¡Lograste tu meta "${g.name}"!`,
                    url: '/metas',
                });
            }
        }

        // Recordatorios activos con next_trigger = hoy
        const { data: reminders } = await supabase
            .from('reminders')
            .select('title, description, remind_at')
            .eq('user_id', userId)
            .eq('is_active', true)
            .eq('next_trigger', todayStr);
        for (const rem of (reminders ?? [])) {
            notifications.push({
                title: `🔔 ${rem.title}`,
                body: rem.description || `Recordatorio programado para hoy${rem.remind_at ? ` a las ${rem.remind_at.slice(0, 5)}` : ''}`,
                url: '/recordatorios',
            });
        }

        // Write to app_notifications table (in-app inbox)
        for (const notif of notifications) {
            const n = notif as { title: string; body: string; url?: string };
            await supabase.from('app_notifications').insert({
                user_id: userId,
                title: n.title,
                body: n.body,
                type: n.title.includes('⚠') || n.title.includes('🚨') ? 'warning' : 'info',
                link: n.url ?? null,
            });
        }

        // Send up to 3 push notifications per user (most critical first)
        for (const notif of notifications.slice(0, 3)) {
            await sendPush(sub, notif);
            sent++;
        }
    }

    res.json({ sent, users: subs.length });
}
