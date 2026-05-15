import { useState, useEffect, useCallback } from 'react';
import { format, addDays, startOfDay, getDaysInMonth, setDate } from 'date-fns';
import { es } from 'date-fns/locale';
import { TrendingUp, TrendingDown, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import './FlujoCaja.css';

interface CashEvent {
    date: string;
    label: string;
    amount: number;
    direction: 'in' | 'out';
    source: 'debt' | 'subscription' | 'recurring' | 'salary';
}

export function FlujoCaja() {
    const { user, profile } = useAuth();
    const currency = profile?.currency || 'COP';
    const [events, setEvents] = useState<CashEvent[]>([]);
    const [startBalance, setStartBalance] = useState(0);
    const [loading, setLoading] = useState(true);

    const fmt = (n: number) =>
        new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        const today = startOfDay(new Date());
        const horizon = addDays(today, 30);
        const horizonStr = format(horizon, 'yyyy-MM-dd');
        const todayStr = format(today, 'yyyy-MM-dd');

        const [accRes, debtRes, subRes, txRes] = await Promise.all([
            supabase.from('accounts').select('balance').eq('user_id', user.id).eq('is_active', true),
            supabase.from('debts').select('name,payment_day,installment_amount,currency').eq('user_id', user.id).eq('status', 'active'),
            supabase.from('subscriptions').select('name,amount,currency,billing_date').eq('user_id', user.id).eq('status', 'active'),
            supabase.from('transactions').select('description,merchant,amount,type,date,category_id').eq('user_id', user.id).eq('is_recurring', true).gte('date', todayStr).lte('date', horizonStr),
        ]);

        // Current balance
        const bal = (accRes.data || []).reduce((s, a) => s + Number(a.balance), 0);
        setStartBalance(bal);

        const result: CashEvent[] = [];
        const now = new Date();
        const daysInMonth = getDaysInMonth(now);

        // Debts: next occurrence within 30 days
        for (const d of debtRes.data || []) {
            if (!d.payment_day || !d.installment_amount) continue;
            const day = Math.min(d.payment_day, daysInMonth);
            let dt = setDate(now, day);
            if (dt < today) dt = setDate(addDays(dt, 32), day); // next month
            if (dt <= horizon) {
                result.push({ date: format(dt, 'yyyy-MM-dd'), label: d.name, amount: Number(d.installment_amount), direction: 'out', source: 'debt' });
            }
        }

        // Subscriptions
        for (const s of subRes.data || []) {
            if (!s.billing_date || !s.amount) continue;
            const day = Math.min(parseInt(String(s.billing_date).split('-')[2] || s.billing_date, 10), daysInMonth);
            let dt = setDate(now, day);
            if (dt < today) dt = setDate(addDays(dt, 32), day);
            if (dt <= horizon) {
                result.push({ date: format(dt, 'yyyy-MM-dd'), label: s.name, amount: Number(s.amount), direction: 'out', source: 'subscription' });
            }
        }

        // Recurring transactions already created for this period
        for (const t of txRes.data || []) {
            result.push({
                date: t.date,
                label: t.description || t.merchant || 'Recurrente',
                amount: Number(t.amount),
                direction: t.type === 'income' ? 'in' : 'out',
                source: 'recurring',
            });
        }

        result.sort((a, b) => a.date.localeCompare(b.date));
        setEvents(result);
        setLoading(false);
    }, [user]);

    useEffect(() => { load(); }, [load]);

    // Build day-by-day timeline
    const today = startOfDay(new Date());
    const days: { date: string; label: string; isToday: boolean; isWeekend: boolean; events: CashEvent[]; balance: number }[] = [];
    let running = startBalance;

    for (let i = 0; i <= 30; i++) {
        const d = addDays(today, i);
        const dStr = format(d, 'yyyy-MM-dd');
        const dayEvents = events.filter(e => e.date === dStr);
        for (const e of dayEvents) running += e.direction === 'in' ? e.amount : -e.amount;
        if (dayEvents.length > 0 || i === 0) {
            days.push({
                date: dStr,
                label: format(d, "EEE d MMM", { locale: es }),
                isToday: i === 0,
                isWeekend: d.getDay() === 0 || d.getDay() === 6,
                events: dayEvents,
                balance: running,
            });
        }
    }

    const minBalance = Math.min(...days.map(d => d.balance));
    const hasRisk = minBalance < 0;

    if (loading) return (
        <div className="fc-loading">
            <RefreshCw size={24} className="fc-spin" />
            <p>Calculando flujo de caja...</p>
        </div>
    );

    return (
        <div className="fc-page">
            <div className="fc-summary">
                <div className="fc-sum-card">
                    <span className="fc-sum-label">Saldo actual</span>
                    <span className="fc-sum-val">{fmt(startBalance)}</span>
                </div>
                <div className={`fc-sum-card ${minBalance < 0 ? 'danger' : 'safe'}`}>
                    <span className="fc-sum-label">Saldo mínimo (30d)</span>
                    <span className="fc-sum-val">{fmt(minBalance)}</span>
                </div>
                <div className="fc-sum-card">
                    <span className="fc-sum-label">Egresos previstos</span>
                    <span className="fc-sum-val fc-out">{fmt(events.filter(e => e.direction === 'out').reduce((s, e) => s + e.amount, 0))}</span>
                </div>
                <div className="fc-sum-card">
                    <span className="fc-sum-label">Ingresos previstos</span>
                    <span className="fc-sum-val fc-in">{fmt(events.filter(e => e.direction === 'in').reduce((s, e) => s + e.amount, 0))}</span>
                </div>
            </div>

            {hasRisk && (
                <div className="fc-risk-banner">
                    <AlertTriangle size={16} />
                    <span>Tu saldo podría quedar negativo en los próximos 30 días. Revisa los egresos previstos.</span>
                </div>
            )}

            <div className="fc-timeline">
                {days.length === 0 && (
                    <div className="fc-empty">
                        <p>No hay movimientos previstos en los próximos 30 días.</p>
                        <p className="fc-empty-hint">Activa transacciones recurrentes o registra deudas con día de pago para verlas aquí.</p>
                    </div>
                )}
                {days.map(day => (
                    <div key={day.date} className={`fc-day ${day.isToday ? 'today' : ''} ${day.isWeekend ? 'weekend' : ''}`}>
                        <div className="fc-day-header">
                            <span className="fc-day-label">
                                {day.isToday ? 'Hoy · ' : ''}{day.label}
                            </span>
                            <span className={`fc-day-balance ${day.balance < 0 ? 'neg' : day.balance < startBalance * 0.2 ? 'warn' : ''}`}>
                                {fmt(day.balance)}
                                <ChevronRight size={12} />
                            </span>
                        </div>
                        {day.events.map((e, i) => (
                            <div key={i} className={`fc-event ${e.direction}`}>
                                <span className="fc-event-icon">
                                    {e.direction === 'in' ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                                </span>
                                <span className="fc-event-label">{e.label}</span>
                                <span className={`fc-event-source fc-src-${e.source}`}>{e.source === 'debt' ? 'Deuda' : e.source === 'subscription' ? 'Suscripción' : 'Recurrente'}</span>
                                <span className={`fc-event-amt ${e.direction}`}>
                                    {e.direction === 'in' ? '+' : '-'}{fmt(e.amount)}
                                </span>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
