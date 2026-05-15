import { useState, useEffect, useMemo } from 'react';
import { BarChart3, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import './Benchmarks.css';

// DANE 2023-2024 average Colombian household spending by category (% of total income)
// Source: DANE ENPH 2016-2017 updated estimates
const DANE_BENCHMARKS: { category: string; key: string; pct: number; colorClass: string }[] = [
    { category: 'Vivienda y servicios', key: 'vivienda', pct: 34, colorClass: 'indigo' },
    { category: 'Alimentación', key: 'alimentacion', pct: 22, colorClass: 'emerald' },
    { category: 'Transporte', key: 'transporte', pct: 10, colorClass: 'amber' },
    { category: 'Salud', key: 'salud', pct: 5, colorClass: 'red' },
    { category: 'Educación', key: 'educacion', pct: 4, colorClass: 'violet' },
    { category: 'Entretenimiento', key: 'entretenimiento', pct: 4, colorClass: 'pink' },
    { category: 'Vestuario', key: 'vestuario', pct: 3, colorClass: 'cyan' },
    { category: 'Comunicaciones', key: 'comunicaciones', pct: 3, colorClass: 'slate' },
    { category: 'Otros', key: 'otros', pct: 15, colorClass: 'gray' },
];

const SMMLV_2025 = 1_423_500;

const SALARY_BRACKETS = [
    { label: 'Menos de 2 SMMLV', max: 2 * SMMLV_2025 },
    { label: '2–4 SMMLV', max: 4 * SMMLV_2025 },
    { label: '4–8 SMMLV', max: 8 * SMMLV_2025 },
    { label: 'Más de 8 SMMLV', max: Infinity },
];

function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

function fmt(n: number, currency: string) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

export function Benchmarks() {
    const { user, profile } = useAuth();
    const currency = profile?.currency || 'COP';
    const [loading, setLoading] = useState(true);
    const [income, setIncome] = useState(0);
    const [byCategory, setByCategory] = useState<{ name: string; amount: number }[]>([]);
    const [monthsBack, setMonthsBack] = useState(1);

    const monthlyIncome = profile
        ? profile.income_type === 'hourly'
            ? (profile.hourly_rate || 0) * (profile.hours_per_week || 0) * 4.33
            : (profile.fixed_salary || 0)
        : 0;

    const bracket = useMemo(() => {
        const inc = monthlyIncome || income;
        return SALARY_BRACKETS.find(b => inc < b.max) ?? SALARY_BRACKETS[SALARY_BRACKETS.length - 1];
    }, [monthlyIncome, income]);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        const now = new Date();
        const start = startOfMonth(subMonths(now, monthsBack - 1)).toISOString().slice(0, 10);
        const end = endOfMonth(now).toISOString().slice(0, 10);

        Promise.all([
            supabase.from('transactions').select('amount, type, category_id').eq('user_id', user.id).gte('date', start).lte('date', end),
            supabase.from('categories').select('id, name').eq('user_id', user.id),
        ]).then(([txRes, catRes]) => {
            const txs = txRes.data || [];
            const cats = catRes.data || [];
            const catNameById: Record<string, string> = {};
            for (const c of cats) catNameById[c.id] = c.name;

            const totalInc = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
            setIncome(totalInc / monthsBack);

            const catMap: Record<string, number> = {};
            for (const tx of txs.filter(t => t.type === 'expense')) {
                const name = tx.category_id ? (catNameById[tx.category_id] || 'Sin categoría') : 'Sin categoría';
                catMap[name] = (catMap[name] || 0) + Number(tx.amount);
            }
            const sorted = Object.entries(catMap)
                .map(([name, amount]) => ({ name, amount: amount / monthsBack }))
                .sort((a, b) => b.amount - a.amount);
            setByCategory(sorted);
            setLoading(false);
        });
    }, [user, monthsBack]);

    const effectiveIncome = (monthlyIncome || income) || 1;
    const totalExpenses = byCategory.reduce((s, c) => s + c.amount, 0);

    return (
        <div className="bench-page animate-fadeIn">
            <div className="bench-header">
                <div>
                    <h1><BarChart3 size={22} /> Benchmarks Colombianos</h1>
                    <p>Compara tus gastos vs. los promedios nacionales DANE · {bracket.label}</p>
                </div>
                <div className="bench-header-right">
                    <select
                        className="bench-period-select"
                        title="Período de análisis"
                        value={monthsBack}
                        onChange={e => setMonthsBack(Number(e.target.value))}
                    >
                        <option value={1}>Último mes</option>
                        <option value={3}>Últimos 3 meses</option>
                        <option value={6}>Últimos 6 meses</option>
                    </select>
                    <button type="button" title="Actualizar datos" className="btn btn-secondary" onClick={() => setLoading(true)} disabled={loading}>
                        <RefreshCw size={15} className={loading ? 'spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Summary cards */}
            <div className="bench-summary">
                <div className="bench-stat">
                    <span className="bench-stat-label">Ingreso mensual</span>
                    <strong className="bench-stat-value">{fmt(effectiveIncome, currency)}</strong>
                </div>
                <div className="bench-stat">
                    <span className="bench-stat-label">Gastos totales</span>
                    <strong className="bench-stat-value">{fmt(totalExpenses, currency)}</strong>
                </div>
                <div className="bench-stat">
                    <span className="bench-stat-label">Tasa de gasto</span>
                    <strong className="bench-stat-value">{fmtPct((totalExpenses / effectiveIncome) * 100)}</strong>
                </div>
                <div className="bench-stat">
                    <span className="bench-stat-label">SMMLV 2025</span>
                    <strong className="bench-stat-value">{fmt(SMMLV_2025, 'COP')}</strong>
                </div>
            </div>

            {/* DANE comparison table */}
            <div className="bench-card">
                <h2>Comparación vs. Promedio Nacional</h2>
                <p className="bench-subtitle">
                    Tus gastos por categoría vs. el hogar colombiano promedio según datos DANE.
                    Columnas en verde: gastas menos que el promedio. Rojo: gastas más.
                </p>
                <div className="bench-table-wrap">
                    <table className="bench-table">
                        <thead>
                            <tr>
                                <th>Categoría</th>
                                <th className="text-right">DANE %</th>
                                <th className="text-right">Tu %</th>
                                <th className="text-right">Diferencia</th>
                                <th className="text-right">Tu monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {DANE_BENCHMARKS.map(b => {
                                const match = byCategory.find(c =>
                                    c.name.toLowerCase().includes(b.key) ||
                                    b.key.includes(c.name.toLowerCase().slice(0, 5))
                                );
                                const userAmt = match?.amount ?? 0;
                                const userPct = (userAmt / effectiveIncome) * 100;
                                const diff = userPct - b.pct;
                                const hasTx = userAmt > 0;

                                return (
                                    <tr key={b.key}>
                                        <td>
                                            <span className={`bench-cat-dot dot-${b.colorClass}`} />
                                            {b.category}
                                        </td>
                                        <td className="text-right bench-dane-pct">{fmtPct(b.pct)}</td>
                                        <td className="text-right">{hasTx ? fmtPct(userPct) : '—'}</td>
                                        <td className="text-right">
                                            {hasTx ? (
                                                <span className={`bench-diff ${diff > 2 ? 'over' : diff < -2 ? 'under' : 'neutral'}`}>
                                                    {diff > 0.05 ? <TrendingUp size={13} /> : diff < -0.05 ? <TrendingDown size={13} /> : <Minus size={13} />}
                                                    {diff > 0 ? '+' : ''}{fmtPct(diff)}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td className="text-right bench-amount">{hasTx ? fmt(userAmt, currency) : '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* User categories not in DANE */}
            {byCategory.filter(c => !DANE_BENCHMARKS.some(b =>
                c.name.toLowerCase().includes(b.key) || b.key.includes(c.name.toLowerCase().slice(0, 5))
            )).length > 0 && (
                <div className="bench-card">
                    <h2>Otras categorías tuyas</h2>
                    <div className="bench-others">
                        {byCategory
                            .filter(c => !DANE_BENCHMARKS.some(b =>
                                c.name.toLowerCase().includes(b.key) || b.key.includes(c.name.toLowerCase().slice(0, 5))
                            ))
                            .map(c => (
                                <div key={c.name} className="bench-other-item">
                                    <span className="bench-other-name">{c.name}</span>
                                    <span className="bench-other-pct">{fmtPct((c.amount / effectiveIncome) * 100)}</span>
                                    <span className="bench-other-amt">{fmt(c.amount, currency)}</span>
                                </div>
                            ))
                        }
                    </div>
                </div>
            )}

            {!loading && byCategory.length === 0 && (
                <div className="bench-empty">
                    <BarChart3 size={48} strokeWidth={1} />
                    <p>Registra gastos con categorías para comparar con los promedios nacionales</p>
                </div>
            )}
        </div>
    );
}
