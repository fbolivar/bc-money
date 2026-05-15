import { useState, useEffect, useMemo } from 'react';
import { Trophy, Target, TrendingDown, PiggyBank, ReceiptText, Star, RefreshCw, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { es } from 'date-fns/locale';
import './Retos.css';

interface Challenge {
    id: string;
    icon: typeof Trophy;
    title: string;
    description: string;
    category: 'ahorro' | 'gastos' | 'habitos';
    check: (data: ChallengeData) => { progress: number; target: number; unit: string; done: boolean };
}

interface ChallengeData {
    currentIncome: number;
    currentExpenses: number;
    prevExpenses: number;
    txCount: number;
    savingsRate: number;
    categoriesOver: number;
}

const CHALLENGES: Challenge[] = [
    {
        id: 'save20',
        icon: PiggyBank,
        title: 'Ahorra el 20%',
        description: 'Mantén una tasa de ahorro de al menos 20% este mes (regla 50/30/20)',
        category: 'ahorro',
        check: ({ savingsRate }) => ({ progress: Math.min(savingsRate, 20), target: 20, unit: '%', done: savingsRate >= 20 }),
    },
    {
        id: 'reduce10',
        icon: TrendingDown,
        title: 'Reduce gastos 10%',
        description: 'Gasta al menos 10% menos que el mes anterior',
        category: 'gastos',
        check: ({ currentExpenses, prevExpenses }) => {
            if (prevExpenses === 0) return { progress: 0, target: 10, unit: '%', done: false };
            const reduction = ((prevExpenses - currentExpenses) / prevExpenses) * 100;
            return { progress: Math.min(Math.max(reduction, 0), 10), target: 10, unit: '%', done: reduction >= 10 };
        },
    },
    {
        id: 'tx30',
        icon: ReceiptText,
        title: '30 transacciones',
        description: 'Registra al menos 30 transacciones este mes para llevar el control total',
        category: 'habitos',
        check: ({ txCount }) => ({ progress: Math.min(txCount, 30), target: 30, unit: 'registros', done: txCount >= 30 }),
    },
    {
        id: 'allbudgets',
        icon: Target,
        title: 'Presupuesto bajo control',
        description: 'Mantén todas tus categorías de presupuesto por debajo del 80%',
        category: 'gastos',
        check: ({ categoriesOver }) => ({
            progress: Math.max(0, 5 - categoriesOver),
            target: 5,
            unit: 'categorías ok',
            done: categoriesOver === 0,
        }),
    },
    {
        id: 'save30',
        icon: Star,
        title: '¡Elite! Ahorra 30%',
        description: 'Alcanza una tasa de ahorro del 30% — nivel de ahorro élite',
        category: 'ahorro',
        check: ({ savingsRate }) => ({ progress: Math.min(savingsRate, 30), target: 30, unit: '%', done: savingsRate >= 30 }),
    },
    {
        id: 'reduce20',
        icon: TrendingDown,
        title: 'Recorta el 20%',
        description: 'Reduce tus gastos un 20% respecto al mes anterior — reto difícil',
        category: 'gastos',
        check: ({ currentExpenses, prevExpenses }) => {
            if (prevExpenses === 0) return { progress: 0, target: 20, unit: '%', done: false };
            const reduction = ((prevExpenses - currentExpenses) / prevExpenses) * 100;
            return { progress: Math.min(Math.max(reduction, 0), 20), target: 20, unit: '%', done: reduction >= 20 };
        },
    },
];

const CAT_COLORS: Record<string, string> = {
    ahorro: '#10b981', gastos: '#ef4444', habitos: '#6366f1',
};
const CAT_LABELS: Record<string, string> = {
    ahorro: 'Ahorro', gastos: 'Gastos', habitos: 'Hábitos',
};

function fmtMoney(n: number, currency: string) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

export function Retos() {
    const { user, profile } = useAuth();
    const currency = profile?.currency || 'COP';
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ChallengeData | null>(null);
    const [filter, setFilter] = useState<'all' | 'ahorro' | 'gastos' | 'habitos'>('all');

    const currentMonth = new Date();
    const monthLabel = format(currentMonth, 'MMMM yyyy', { locale: es });

    const load = async () => {
        if (!user) return;
        setLoading(true);
        const mStart = startOfMonth(currentMonth).toISOString().slice(0, 10);
        const mEnd = endOfMonth(currentMonth).toISOString().slice(0, 10);
        const prevStart = startOfMonth(subMonths(currentMonth, 1)).toISOString().slice(0, 10);
        const prevEnd = endOfMonth(subMonths(currentMonth, 1)).toISOString().slice(0, 10);

        const [{ data: curTx }, { data: prevTx }, { data: budgets }, { data: categories }] = await Promise.all([
            supabase.from('transactions').select('amount,type,category_id').eq('user_id', user.id).gte('date', mStart).lte('date', mEnd),
            supabase.from('transactions').select('amount,type').eq('user_id', user.id).gte('date', prevStart).lte('date', prevEnd),
            supabase.from('budgets').select('amount,category_id').eq('user_id', user.id),
            supabase.from('categories').select('id').eq('user_id', user.id),
        ]);

        const cur = curTx || [];
        const prev = prevTx || [];
        const currentIncome = cur.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
        const currentExpenses = cur.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
        const prevExpenses = prev.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
        const savingsRate = currentIncome > 0 ? ((currentIncome - currentExpenses) / currentIncome) * 100 : 0;

        let categoriesOver = 0;
        for (const b of (budgets || [])) {
            const spent = cur.filter(t => t.type === 'expense' && t.category_id === b.category_id).reduce((s, t) => s + Number(t.amount), 0);
            if ((spent / Number(b.amount)) * 100 > 80) categoriesOver++;
        }

        setData({
            currentIncome, currentExpenses, prevExpenses,
            txCount: cur.length, savingsRate,
            categoriesOver: Math.min(categoriesOver, 5),
        });
        setLoading(false);
    };

    useEffect(() => { load(); }, [user]);

    const results = useMemo(() => {
        if (!data) return [];
        return CHALLENGES.map(c => ({ ...c, result: c.check(data) }));
    }, [data]);

    const filtered = filter === 'all' ? results : results.filter(c => c.category === filter);
    const completed = results.filter(c => c.result.done).length;

    return (
        <div className="retos-page animate-fadeIn">
            <div className="retos-header">
                <div>
                    <h1><Trophy size={22} /> Retos Financieros</h1>
                    <p>Desafíos del mes: {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</p>
                </div>
                <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
                    <RefreshCw size={15} className={loading ? 'spin' : ''} />
                </button>
            </div>

            {/* Progress summary */}
            <div className="retos-summary">
                <div className="rs-score">
                    <span className="rs-num">{completed}</span>
                    <span className="rs-den">/ {CHALLENGES.length}</span>
                    <span className="rs-label">completados</span>
                </div>
                <div className="rs-bar-wrap">
                    <div className="rs-bar" style={{ width: `${(completed / CHALLENGES.length) * 100}%` }} />
                </div>
                {data && (
                    <div className="rs-stats">
                        <span>Ahorro: <strong>{data.savingsRate.toFixed(1)}%</strong></span>
                        <span>Gastos actuales: <strong>{fmtMoney(data.currentExpenses, currency)}</strong></span>
                        <span>Transacciones: <strong>{data.txCount}</strong></span>
                    </div>
                )}
            </div>

            {/* Filter tabs */}
            <div className="retos-tabs">
                {(['all', 'ahorro', 'gastos', 'habitos'] as const).map(f => (
                    <button key={f} type="button"
                        className={`reto-tab ${filter === f ? 'active' : ''}`}
                        onClick={() => setFilter(f)}>
                        {f === 'all' ? 'Todos' : CAT_LABELS[f]}
                    </button>
                ))}
            </div>

            {/* Challenge cards */}
            <div className="retos-grid">
                {filtered.map(c => {
                    const pct = (c.result.progress / c.result.target) * 100;
                    const Icon = c.icon;
                    return (
                        <div key={c.id} className={`reto-card ${c.result.done ? 'reto-card--done' : ''}`}>
                            <div className="reto-card-top">
                                <div className="reto-icon" style={{ background: `${CAT_COLORS[c.category]}20`, color: CAT_COLORS[c.category] }}>
                                    <Icon size={20} />
                                </div>
                                <span className="reto-cat-badge" style={{ background: `${CAT_COLORS[c.category]}15`, color: CAT_COLORS[c.category] }}>
                                    {CAT_LABELS[c.category]}
                                </span>
                                {c.result.done && <CheckCircle2 size={20} className="reto-done-icon" />}
                            </div>
                            <h3>{c.title}</h3>
                            <p>{c.description}</p>
                            <div className="reto-progress">
                                <div className="reto-progress-bar">
                                    <div
                                        className="reto-progress-fill"
                                        style={{
                                            width: `${Math.min(pct, 100)}%`,
                                            background: c.result.done ? '#10b981' : CAT_COLORS[c.category],
                                        }}
                                    />
                                </div>
                                <span className="reto-progress-label">
                                    {c.result.progress.toFixed(1)} / {c.result.target} {c.result.unit} ({Math.min(pct, 100).toFixed(0)}%)
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
