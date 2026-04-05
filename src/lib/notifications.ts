import { supabase } from './supabase';
import { differenceInDays, format, startOfMonth, endOfMonth } from 'date-fns';

export async function requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
}

export function canNotify(): boolean {
    return 'Notification' in window && Notification.permission === 'granted';
}

function showNotification(title: string, body: string, tag: string) {
    if (!canNotify()) return;
    try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification(title, {
                    body, tag, icon: '/pwa-192x192.png',
                    badge: '/favicon.png', vibrate: [200, 100, 200],
                });
            });
        } else {
            new Notification(title, { body, tag, icon: '/pwa-192x192.png' });
        }
    } catch {
        // Silent fail
    }
}

export async function checkAndNotify(userId: string, settings: {
    alerts_enabled: boolean;
    alert_warranty_days: number;
    alert_debt_days: number;
    alert_budget_pct: number;
}) {
    if (!settings.alerts_enabled || !canNotify()) return;

    const today = format(new Date(), 'yyyy-MM-dd');
    const lastCheck = localStorage.getItem('bc-money-last-notify');
    if (lastCheck === today) return; // Only check once per day
    localStorage.setItem('bc-money-last-notify', today);

    // Check warranties
    const { data: warranties } = await supabase.from('warranties')
        .select('product_name,warranty_end_date').eq('user_id', userId);
    if (warranties) {
        for (const w of warranties) {
            const days = differenceInDays(new Date(w.warranty_end_date), new Date());
            if (days >= 0 && days <= settings.alert_warranty_days) {
                showNotification('Garantía por vencer', `${w.product_name} vence en ${days} día${days !== 1 ? 's' : ''}`, `warranty-${w.product_name}`);
            }
        }
    }

    // Check debts
    const { data: debts } = await supabase.from('debts')
        .select('name,payment_day,installment_amount,currency').eq('user_id', userId).eq('status', 'active');
    if (debts) {
        for (const d of debts) {
            if (!d.payment_day) continue;
            const now = new Date();
            let next = new Date(now.getFullYear(), now.getMonth(), d.payment_day);
            if (next <= now) next = new Date(now.getFullYear(), now.getMonth() + 1, d.payment_day);
            const days = differenceInDays(next, now);
            if (days <= settings.alert_debt_days) {
                const amt = d.installment_amount ? ` — ${d.currency} ${Number(d.installment_amount).toLocaleString()}` : '';
                showNotification('Pago próximo', `${d.name}: pago en ${days} día${days !== 1 ? 's' : ''}${amt}`, `debt-${d.name}`);
            }
        }
    }

    // Check budgets
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());
    const [budgetsRes, txRes] = await Promise.all([
        supabase.from('budgets').select('category_id,amount').eq('user_id', userId),
        supabase.from('transactions').select('category_id,amount').eq('user_id', userId).eq('type', 'expense')
            .gte('date', format(monthStart, 'yyyy-MM-dd')).lte('date', format(monthEnd, 'yyyy-MM-dd')),
    ]);
    if (budgetsRes.data && txRes.data) {
        const catRes = await supabase.from('categories').select('id,name').or(`user_id.eq.${userId},is_system.eq.true`);
        for (const b of budgetsRes.data) {
            const spent = txRes.data.filter(t => t.category_id === b.category_id).reduce((s, t) => s + Number(t.amount), 0);
            const pct = Number(b.amount) > 0 ? (spent / Number(b.amount)) * 100 : 0;
            if (pct >= settings.alert_budget_pct) {
                const cat = catRes.data?.find(c => c.id === b.category_id);
                showNotification('Presupuesto', `${cat?.name || 'Categoría'}: ${Math.round(pct)}% usado`, `budget-${b.category_id}`);
            }
        }
    }

    // Check subscriptions
    const { data: subs } = await supabase.from('subscriptions')
        .select('name,next_billing_date,amount,currency').eq('user_id', userId).eq('status', 'active');
    if (subs) {
        for (const s of subs) {
            const days = differenceInDays(new Date(s.next_billing_date), new Date());
            if (days >= 0 && days <= 3) {
                showNotification('Cobro próximo', `${s.name}: cobro en ${days} día${days !== 1 ? 's' : ''} (${s.currency} ${Number(s.amount).toLocaleString()})`, `sub-${s.name}`);
            }
        }
    }
}
