import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CreditCard, ShieldCheck, Repeat, Wrench, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Debt, Warranty, Subscription } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isSameMonth, addMonths, subMonths, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import './Calendario.css';

interface CalendarEvent {
    id: string;
    date: Date;
    title: string;
    type: 'debt' | 'warranty' | 'subscription' | 'maintenance';
    amount?: number;
    currency?: string;
}

function fmt(n: number, c: string) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: c, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n); }

const TYPE_ICONS = { debt: CreditCard, warranty: ShieldCheck, subscription: Repeat, maintenance: Wrench };
const TYPE_COLORS = { debt: '#EF4444', warranty: '#3B82F6', subscription: '#8B5CF6', maintenance: '#06B6D4' };
const TYPE_LABELS = { debt: 'Pago deuda', warranty: 'Vence garantía', subscription: 'Cobro suscripción', maintenance: 'Mantenimiento' };

export function Calendario() {
    const { user, profile } = useAuth();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [loading, setLoading] = useState(true);

    const currency = profile?.currency || 'COP';

    const fetchEvents = useCallback(async () => {
        if (!user) return;
        const [debtsRes, warRes, subRes, maintRes] = await Promise.all([
            supabase.from('debts').select('id,name,payment_day,installment_amount,currency').eq('user_id', user.id).eq('status', 'active'),
            supabase.from('warranties').select('id,product_name,warranty_end_date').eq('user_id', user.id),
            supabase.from('subscriptions').select('id,name,next_billing_date,amount,currency').eq('user_id', user.id).eq('status', 'active'),
            supabase.from('home_maintenance').select('id,name,next_date,cost,currency').eq('user_id', user.id).eq('status', 'scheduled'),
        ]);

        const evts: CalendarEvent[] = [];

        // Debt payments - generate for each month's payment_day
        for (const d of (debtsRes.data || [])) {
            if (!d.payment_day) continue;
            for (let m = -1; m <= 2; m++) {
                const dt = addMonths(new Date(), m);
                const payDate = new Date(dt.getFullYear(), dt.getMonth(), Math.min(d.payment_day, 28));
                evts.push({ id: `d-${d.id}-${m}`, date: payDate, title: d.name, type: 'debt', amount: d.installment_amount, currency: d.currency });
            }
        }

        // Warranties expiring
        for (const w of (warRes.data || [])) {
            evts.push({ id: `w-${w.id}`, date: new Date(w.warranty_end_date), title: w.product_name, type: 'warranty' });
        }

        // Subscriptions
        for (const s of (subRes.data || [])) {
            evts.push({ id: `s-${s.id}`, date: new Date(s.next_billing_date), title: s.name, type: 'subscription', amount: s.amount, currency: s.currency });
        }

        // Maintenance
        for (const mt of (maintRes.data || [])) {
            if (!mt.next_date) continue;
            evts.push({ id: `m-${mt.id}`, date: new Date(mt.next_date), title: mt.name, type: 'maintenance', amount: mt.cost, currency: mt.currency });
        }

        setEvents(evts);
        setLoading(false);
    }, [user]);

    useEffect(() => { if (user) fetchEvents(); }, [user, fetchEvents]);

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startDay = getDay(monthStart); // 0=Sunday

    const monthEvents = useMemo(() => events.filter(e => isSameMonth(e.date, currentMonth)), [events, currentMonth]);
    const selectedEvents = useMemo(() => selectedDate ? events.filter(e => isSameDay(e.date, selectedDate)) : [], [events, selectedDate]);

    const getEventsForDay = (day: Date) => events.filter(e => isSameDay(e.date, day));

    // Upcoming events (next 14 days)
    const upcoming = useMemo(() => {
        const now = new Date();
        const limit = addMonths(now, 0.5);
        return events.filter(e => e.date >= now && e.date <= limit).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 8);
    }, [events]);

    if (loading) return <div className="loading-container"><div className="loading-spinner"></div></div>;

    return (
        <div className="calendario-page animate-fadeIn">
            <div className="cal-header">
                <div><h1>Calendario Financiero</h1><p>Pagos, vencimientos y cobros programados</p></div>
            </div>

            <div className="cal-layout">
                {/* Calendar */}
                <div className="cal-card cal-main">
                    <div className="cal-nav">
                        <button type="button" className="btn btn-ghost" title="Anterior" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft size={20} /></button>
                        <h3>{format(currentMonth, 'MMMM yyyy', { locale: es })}</h3>
                        <button type="button" className="btn btn-ghost" title="Siguiente" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight size={20} /></button>
                    </div>

                    <div className="cal-grid">
                        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <div key={d} className="cal-weekday">{d}</div>)}
                        {Array.from({ length: (startDay + 6) % 7 }, (_, i) => <div key={`e-${i}`} className="cal-day empty"></div>)}
                        {days.map(day => {
                            const dayEvents = getEventsForDay(day);
                            const isSelected = selectedDate && isSameDay(day, selectedDate);
                            return (
                                <div key={day.toISOString()} className={`cal-day ${isToday(day) ? 'today' : ''} ${isSelected ? 'selected' : ''} ${dayEvents.length > 0 ? 'has-events' : ''}`}
                                    onClick={() => setSelectedDate(day)}>
                                    <span className="cal-day-num">{format(day, 'd')}</span>
                                    <div className="cal-day-dots">
                                        {dayEvents.slice(0, 3).map(e => <span key={e.id} className="cal-dot" style={{ backgroundColor: TYPE_COLORS[e.type] }}></span>)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="cal-legend">
                        {Object.entries(TYPE_LABELS).map(([k, v]) => (
                            <div key={k} className="cal-legend-item"><span className="cal-legend-dot" style={{ backgroundColor: TYPE_COLORS[k as keyof typeof TYPE_COLORS] }}></span>{v}</div>
                        ))}
                    </div>
                </div>

                {/* Sidebar */}
                <div className="cal-sidebar">
                    {/* Selected day events */}
                    {selectedDate && (
                        <div className="cal-card">
                            <h3>{format(selectedDate, "d 'de' MMMM", { locale: es })}</h3>
                            {selectedEvents.length === 0 ? <p className="cal-empty">Sin eventos este día</p> : (
                                <div className="cal-event-list">
                                    {selectedEvents.map(e => {
                                        const Icon = TYPE_ICONS[e.type];
                                        return (
                                            <div key={e.id} className="cal-event" style={{ borderLeftColor: TYPE_COLORS[e.type] }}>
                                                <Icon size={16} style={{ color: TYPE_COLORS[e.type] }} />
                                                <div className="cal-event-info">
                                                    <span className="cal-event-title">{e.title}</span>
                                                    <span className="cal-event-type">{TYPE_LABELS[e.type]}</span>
                                                </div>
                                                {e.amount && <span className="cal-event-amount">{fmt(e.amount, e.currency || currency)}</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Upcoming */}
                    <div className="cal-card">
                        <h3><Clock size={16} /> Próximos Eventos</h3>
                        {upcoming.length === 0 ? <p className="cal-empty">Sin eventos próximos</p> : (
                            <div className="cal-event-list">
                                {upcoming.map(e => {
                                    const Icon = TYPE_ICONS[e.type];
                                    return (
                                        <div key={e.id} className="cal-event" style={{ borderLeftColor: TYPE_COLORS[e.type] }}>
                                            <Icon size={14} style={{ color: TYPE_COLORS[e.type] }} />
                                            <div className="cal-event-info">
                                                <span className="cal-event-title">{e.title}</span>
                                                <span className="cal-event-type">{format(e.date, 'd MMM', { locale: es })} · {TYPE_LABELS[e.type]}</span>
                                            </div>
                                            {e.amount && <span className="cal-event-amount">{fmt(e.amount, e.currency || currency)}</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
