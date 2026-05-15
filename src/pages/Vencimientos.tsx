import { useState, useEffect } from 'react';
import { CalendarDays, CreditCard, Repeat, ShieldCheck, Target, Users, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, differenceInDays, isAfter, addMonths, startOfDay, endOfWeek, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import './Vencimientos.css';

type ItemType = 'deuda' | 'suscripcion' | 'prestamo' | 'garantia' | 'meta';

interface VencimientoItem {
    id: string;
    type: ItemType;
    name: string;
    date: Date;
    amount: number | null;
    currency: string;
    extra: string;
}

const TYPE_LABELS: Record<ItemType, string> = {
    deuda: 'Deuda',
    suscripcion: 'Suscripción',
    prestamo: 'Préstamo',
    garantia: 'Garantía',
    meta: 'Meta',
};

const TYPE_COLORS: Record<ItemType, string> = {
    deuda: '#EF4444',
    suscripcion: '#8B5CF6',
    prestamo: '#F97316',
    garantia: '#10B981',
    meta: '#3B82F6',
};

function TypeIcon({ type, size = 18 }: { type: ItemType; size?: number }) {
    const props = { size, color: TYPE_COLORS[type] };
    if (type === 'deuda') return <CreditCard {...props} />;
    if (type === 'suscripcion') return <Repeat {...props} />;
    if (type === 'prestamo') return <Users {...props} />;
    if (type === 'garantia') return <ShieldCheck {...props} />;
    return <Target {...props} />;
}

function formatCurrency(amount: number, currency: string) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function DaysChip({ days }: { days: number }) {
    const urgent = days <= 7;
    const soon = days <= 30;
    return (
        <span className={`vec-days-chip ${urgent ? 'urgent' : soon ? 'soon' : 'normal'}`}>
            <Clock size={12} />
            {days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `${days} días`}
        </span>
    );
}

function EmptyState() {
    return (
        <div className="vec-empty">
            <CalendarDays size={48} strokeWidth={1.2} />
            <h3>Sin vencimientos próximos</h3>
            <p>No hay deudas, suscripciones, préstamos, garantías ni metas con fecha en los próximos 3 meses.</p>
        </div>
    );
}

function ItemRow({ item }: { item: VencimientoItem }) {
    const today = startOfDay(new Date());
    const days = differenceInDays(item.date, today);
    const urgent = days <= 7;

    return (
        <div className={`vec-item ${urgent ? 'vec-item-urgent' : ''}`}>
            <div className="vec-item-icon" style={{ background: `${TYPE_COLORS[item.type]}18` }}>
                <TypeIcon type={item.type} />
            </div>
            <div className="vec-item-body">
                <span className="vec-item-name">{item.name}</span>
                <span className="vec-item-extra">{item.extra}</span>
            </div>
            <div className="vec-item-right">
                <div className="vec-item-meta">
                    <span className="vec-item-date">
                        <CalendarDays size={12} />
                        {format(item.date, 'd MMM yyyy', { locale: es })}
                    </span>
                    {item.amount !== null && (
                        <span className="vec-item-amount">{formatCurrency(item.amount, item.currency)}</span>
                    )}
                </div>
                <div className="vec-item-tags">
                    <DaysChip days={days} />
                    <span className="vec-badge" style={{ background: `${TYPE_COLORS[item.type]}18`, color: TYPE_COLORS[item.type] }}>
                        {TYPE_LABELS[item.type]}
                    </span>
                </div>
            </div>
        </div>
    );
}

function Section({ title, icon, items }: { title: string; icon: React.ReactNode; items: VencimientoItem[] }) {
    if (items.length === 0) return null;
    return (
        <div className="vec-section">
            <div className="vec-section-header">
                {icon}
                <h2>{title}</h2>
                <span className="vec-section-count">{items.length}</span>
            </div>
            <div className="vec-section-list">
                {items.map(item => <ItemRow key={`${item.type}-${item.id}`} item={item} />)}
            </div>
        </div>
    );
}

export function Vencimientos() {
    const { user } = useAuth();
    const [items, setItems] = useState<VencimientoItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        async function fetchAll() {
            const today = startOfDay(new Date());
            const limit = addMonths(today, 3);
            const uid = user!.id;

            const [debtsRes, subsRes, loansRes, warsRes, goalsRes] = await Promise.all([
                supabase.from('debts').select('id,name,next_payment_date,installment_amount,currency').eq('user_id', uid),
                supabase.from('subscriptions').select('id,name,next_billing_date,amount,currency,billing_cycle').eq('user_id', uid),
                supabase.from('personal_loans').select('id,description,due_date,amount,direction,currency').eq('user_id', uid),
                supabase.from('warranties').select('id,product_name,expiry_date,purchase_price,currency').eq('user_id', uid),
                supabase.from('goals').select('id,name,target_date,target_amount,current_amount,currency').eq('user_id', uid),
            ]);

            const collected: VencimientoItem[] = [];

            (debtsRes.data ?? []).forEach((d: { id: string; name: string; next_payment_date: string; installment_amount: number; currency: string }) => {
                if (!d.next_payment_date) return;
                const date = startOfDay(new Date(d.next_payment_date));
                if (!isAfter(date, today) || isAfter(date, limit)) return;
                collected.push({ id: d.id, type: 'deuda', name: d.name, date, amount: d.installment_amount, currency: d.currency, extra: 'Próximo pago' });
            });

            (subsRes.data ?? []).forEach((s: { id: string; name: string; next_billing_date: string; amount: number; currency: string; billing_cycle: string }) => {
                if (!s.next_billing_date) return;
                const date = startOfDay(new Date(s.next_billing_date));
                if (!isAfter(date, today) || isAfter(date, limit)) return;
                collected.push({ id: s.id, type: 'suscripcion', name: s.name, date, amount: s.amount, currency: s.currency, extra: s.billing_cycle ?? '' });
            });

            (loansRes.data ?? []).forEach((l: { id: string; description: string; due_date: string; amount: number; direction: string; currency: string }) => {
                if (!l.due_date) return;
                const date = startOfDay(new Date(l.due_date));
                if (!isAfter(date, today) || isAfter(date, limit)) return;
                const extra = l.direction === 'lent' ? 'Te deben' : 'Debes';
                collected.push({ id: l.id, type: 'prestamo', name: l.description, date, amount: l.amount, currency: l.currency, extra });
            });

            (warsRes.data ?? []).forEach((w: { id: string; product_name: string; expiry_date: string; purchase_price: number; currency: string }) => {
                if (!w.expiry_date) return;
                const date = startOfDay(new Date(w.expiry_date));
                if (!isAfter(date, today) || isAfter(date, limit)) return;
                const days = differenceInDays(date, today);
                collected.push({ id: w.id, type: 'garantia', name: w.product_name, date, amount: w.purchase_price, currency: w.currency, extra: `Vence garantía · ${days} días restantes` });
            });

            (goalsRes.data ?? []).forEach((g: { id: string; name: string; target_date: string; target_amount: number; current_amount: number; currency: string }) => {
                if (!g.target_date) return;
                const date = startOfDay(new Date(g.target_date));
                if (!isAfter(date, today) || isAfter(date, limit)) return;
                const pct = g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0;
                collected.push({ id: g.id, type: 'meta', name: g.name, date, amount: g.target_amount, currency: g.currency, extra: `Fecha límite · ${pct}% completado` });
            });

            collected.sort((a, b) => a.date.getTime() - b.date.getTime());
            setItems(collected);
            setLoading(false);
        }

        fetchAll();
    }, [user]);

    const today = startOfDay(new Date());
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    const monthEnd = endOfMonth(today);
    const threeMonths = addMonths(today, 3);

    const thisWeek = items.filter(i => !isAfter(i.date, weekEnd));
    const thisMonth = items.filter(i => isAfter(i.date, weekEnd) && !isAfter(i.date, monthEnd));
    const next3m = items.filter(i => isAfter(i.date, monthEnd) && !isAfter(i.date, threeMonths));

    return (
        <div className="vec-container">
            <div className="vec-header">
                <div>
                    <h1>Panel de Vencimientos</h1>
                    <p>Deudas, suscripciones, préstamos, garantías y metas próximas</p>
                </div>
            </div>

            {loading ? (
                <div className="vec-loading">
                    <div className="loading-spinner" />
                </div>
            ) : items.length === 0 ? (
                <EmptyState />
            ) : (
                <div className="vec-sections">
                    <Section
                        title="Esta semana"
                        icon={<AlertTriangle size={18} color="#EF4444" />}
                        items={thisWeek}
                    />
                    <Section
                        title="Este mes"
                        icon={<Clock size={18} color="#F59E0B" />}
                        items={thisMonth}
                    />
                    <Section
                        title="Próximos 3 meses"
                        icon={<CalendarDays size={18} color="#3B82F6" />}
                        items={next3m}
                    />
                </div>
            )}
        </div>
    );
}
