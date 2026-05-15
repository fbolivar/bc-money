import { useState, useEffect, useCallback, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, TrendingDown, Store, BarChart2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import './Comercios.css';

interface MerchantRow {
    name: string;
    total: number;
    count: number;
    avg: number;
    months: Record<string, number>; // 'yyyy-MM' → amount
}

export function Comercios() {
    const { user, profile } = useAuth();
    const currency = profile?.currency || 'COP';
    const [monthOffset, setMonthOffset] = useState(0);
    const [txs, setTxs] = useState<{ merchant: string | null; description: string | null; amount: number; date: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<string | null>(null);

    const fmt = (n: number) =>
        new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        // Load 6 months of expense transactions
        const oldest = format(startOfMonth(subMonths(new Date(), 5)), 'yyyy-MM-dd');
        const { data } = await supabase
            .from('transactions')
            .select('merchant,description,amount,date')
            .eq('user_id', user.id)
            .eq('type', 'expense')
            .gte('date', oldest)
            .order('date', { ascending: false });
        setTxs(data || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { load(); }, [load]);

    const currentMonth = subMonths(new Date(), monthOffset);
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const monthKey = format(currentMonth, 'yyyy-MM');
    const monthLabel = format(currentMonth, 'MMMM yyyy', { locale: es });

    // Build merchant rows for the selected month
    const merchants = useMemo(() => {
        const map: Record<string, MerchantRow> = {};
        for (const t of txs) {
            const key = (t.merchant || t.description || 'Sin descripción').trim().substring(0, 40);
            const txDate = new Date(t.date + 'T12:00:00');
            const mKey = format(txDate, 'yyyy-MM');
            if (!map[key]) map[key] = { name: key, total: 0, count: 0, avg: 0, months: {} };
            map[key].months[mKey] = (map[key].months[mKey] || 0) + Number(t.amount);
            // Only accumulate totals for current viewed month
            if (txDate >= monthStart && txDate <= monthEnd) {
                map[key].total += Number(t.amount);
                map[key].count += 1;
            }
        }
        return Object.values(map)
            .filter(m => m.total > 0)
            .map(m => ({ ...m, avg: m.count > 0 ? m.total / m.count : 0 }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 20);
    }, [txs, monthStart, monthEnd]);

    const totalMonth = merchants.reduce((s, m) => s + m.total, 0);

    // Trend data for selected merchant (last 6 months)
    const trendData = useMemo(() => {
        if (!selected) return [];
        const m = merchants.find(m => m.name === selected) ||
            { months: {} as Record<string, number> };
        return Array.from({ length: 6 }, (_, i) => {
            const d = subMonths(new Date(), 5 - i);
            const k = format(d, 'yyyy-MM');
            return { label: format(d, 'MMM', { locale: es }), amount: m.months[k] || 0 };
        });
    }, [selected, merchants]);

    const maxTrend = Math.max(...trendData.map(d => d.amount), 1);

    if (loading) return <div className="com-loading">Cargando comercios...</div>;

    return (
        <div className="com-page">
            {/* Month nav */}
            <div className="com-nav">
                <button type="button" onClick={() => setMonthOffset(o => o + 1)}><ChevronLeft size={18} /></button>
                <span className="com-month-label" style={{ textTransform: 'capitalize' }}>{monthLabel}</span>
                <button type="button" onClick={() => setMonthOffset(o => Math.max(0, o - 1))} disabled={monthOffset === 0}><ChevronRight size={18} /></button>
            </div>

            <div className="com-layout">
                {/* Left: merchant list */}
                <div className="com-list-panel">
                    <div className="com-panel-header">
                        <Store size={15} />
                        <span>Top comercios</span>
                        <span className="com-total">{fmt(totalMonth)}</span>
                    </div>
                    {merchants.length === 0 ? (
                        <div className="com-empty">Sin gastos registrados con comercio este mes.</div>
                    ) : merchants.map((m, i) => {
                        const pct = totalMonth > 0 ? (m.total / totalMonth) * 100 : 0;
                        return (
                            <button
                                key={m.name}
                                type="button"
                                className={`com-row ${selected === m.name ? 'active' : ''}`}
                                onClick={() => setSelected(s => s === m.name ? null : m.name)}
                            >
                                <span className="com-rank">#{i + 1}</span>
                                <div className="com-row-info">
                                    <span className="com-row-name">{m.name}</span>
                                    <div className="com-bar-wrap">
                                        <div className="com-bar" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                                <div className="com-row-right">
                                    <span className="com-row-amt">{fmt(m.total)}</span>
                                    <span className="com-row-pct">{pct.toFixed(1)}%</span>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Right: trend detail */}
                <div className="com-detail-panel">
                    {!selected ? (
                        <div className="com-detail-empty">
                            <BarChart2 size={32} className="com-detail-icon" />
                            <p>Selecciona un comercio para ver su tendencia de los últimos 6 meses</p>
                        </div>
                    ) : (
                        <>
                            <div className="com-detail-header">
                                <TrendingDown size={16} />
                                <span>{selected}</span>
                            </div>
                            <div className="com-detail-stats">
                                {(() => {
                                    const m = merchants.find(m => m.name === selected);
                                    if (!m) return null;
                                    return (
                                        <>
                                            <div className="com-stat"><span>Este mes</span><strong>{fmt(m.total)}</strong></div>
                                            <div className="com-stat"><span>Transacciones</span><strong>{m.count}</strong></div>
                                            <div className="com-stat"><span>Promedio</span><strong>{fmt(m.avg)}</strong></div>
                                            <div className="com-stat"><span>% del total</span><strong>{totalMonth > 0 ? ((m.total / totalMonth) * 100).toFixed(1) : 0}%</strong></div>
                                        </>
                                    );
                                })()}
                            </div>
                            <div className="com-trend">
                                <p className="com-trend-title">Últimos 6 meses</p>
                                <div className="com-bars">
                                    {trendData.map(d => (
                                        <div key={d.label} className="com-bar-col">
                                            <span className="com-bar-val">{d.amount > 0 ? fmt(d.amount).replace(/[^0-9,.KMB]/g, '').substring(0, 6) : ''}</span>
                                            <div className="com-bar-outer">
                                                <div
                                                    className={`com-bar-inner ${d.label === format(subMonths(new Date(), monthOffset), 'MMM', { locale: es }) ? 'current' : ''}`}
                                                    style={{ height: `${(d.amount / maxTrend) * 100}%` }}
                                                />
                                            </div>
                                            <span className="com-bar-label" style={{ textTransform: 'capitalize' }}>{d.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
