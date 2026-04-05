import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingDown, Calculator, ArrowDown, ArrowUp, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { supabase } from '../lib/supabase';
import type { Debt } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import './PlanDeudas.css';

function fmt(n: number, c: string) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: c, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n); }

type Strategy = 'snowball' | 'avalanche';

interface PayoffResult {
    name: string;
    months: number;
    totalPaid: number;
    totalInterest: number;
    timeline: { month: number; remaining: number }[];
}

function simulatePayoff(debts: Debt[], extraPayment: number, strategy: Strategy): PayoffResult {
    const sorted = [...debts].sort((a, b) =>
        strategy === 'snowball'
            ? Number(a.remaining_amount) - Number(b.remaining_amount)
            : Number(b.interest_rate) - Number(a.interest_rate)
    );

    const balances = sorted.map(d => Number(d.remaining_amount));
    const rates = sorted.map(d => (Number(d.interest_rate) || 0) / 100 / 12);
    const minPayments = sorted.map(d => Number(d.installment_amount) || Number(d.remaining_amount) / 12);

    let month = 0;
    let totalPaid = 0;
    let totalInterest = 0;
    const timeline: { month: number; remaining: number }[] = [];

    while (balances.some(b => b > 0.01) && month < 360) {
        month++;
        let extra = extraPayment;

        for (let i = 0; i < balances.length; i++) {
            if (balances[i] <= 0) continue;
            const interest = balances[i] * rates[i];
            totalInterest += interest;
            balances[i] += interest;

            const payment = Math.min(minPayments[i], balances[i]);
            balances[i] -= payment;
            totalPaid += payment;
        }

        // Apply extra to first non-zero debt
        for (let i = 0; i < balances.length; i++) {
            if (balances[i] <= 0 || extra <= 0) continue;
            const apply = Math.min(extra, balances[i]);
            balances[i] -= apply;
            totalPaid += apply;
            extra -= apply;
            break;
        }

        const remaining = balances.reduce((s, b) => s + Math.max(b, 0), 0);
        if (month % 3 === 0 || remaining <= 0) timeline.push({ month, remaining });
        if (remaining <= 0) break;
    }

    return {
        name: strategy === 'snowball' ? 'Bola de Nieve' : 'Avalancha',
        months: month,
        totalPaid: Math.round(totalPaid),
        totalInterest: Math.round(totalInterest),
        timeline,
    };
}

export function PlanDeudas() {
    const { user, profile } = useAuth();
    const [debts, setDebts] = useState<Debt[]>([]);
    const [loading, setLoading] = useState(true);
    const [extraPayment, setExtraPayment] = useState(0);

    const currency = profile?.currency || 'COP';

    const fetchDebts = useCallback(async () => {
        if (!user) return;
        const { data } = await supabase.from('debts').select('*').eq('user_id', user.id).eq('status', 'active');
        setDebts(data || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { if (user) fetchDebts(); }, [user, fetchDebts]);

    const totalDebt = debts.reduce((s, d) => s + Number(d.remaining_amount), 0);
    const totalMinPayment = debts.reduce((s, d) => s + (Number(d.installment_amount) || Number(d.remaining_amount) / 12), 0);

    const snowball = useMemo(() => simulatePayoff(debts, extraPayment, 'snowball'), [debts, extraPayment]);
    const avalanche = useMemo(() => simulatePayoff(debts, extraPayment, 'avalanche'), [debts, extraPayment]);

    const chartData = useMemo(() => {
        const maxMonths = Math.max(snowball.months, avalanche.months);
        const data = [];
        for (let m = 0; m <= maxMonths; m += 3) {
            const sn = snowball.timeline.find(t => t.month >= m);
            const av = avalanche.timeline.find(t => t.month >= m);
            data.push({
                mes: `M${m}`,
                'Bola de Nieve': sn ? Math.round(sn.remaining) : 0,
                'Avalancha': av ? Math.round(av.remaining) : 0,
            });
        }
        return data;
    }, [snowball, avalanche]);

    if (loading) return <div className="loading-container"><div className="loading-spinner"></div></div>;

    if (debts.length === 0) {
        return (
            <div className="plandeudas-page animate-fadeIn">
                <div className="pd-empty"><TrendingDown size={48} /><h3>No tienes deudas activas</h3><p>Registra deudas en el módulo de Deudas para usar el planificador</p></div>
            </div>
        );
    }

    return (
        <div className="plandeudas-page animate-fadeIn">
            <div className="pd-header">
                <div><h1>Planificador de Deudas</h1><p>Compara estrategias para pagar tus deudas más rápido</p></div>
            </div>

            {/* Current Debts Summary */}
            <div className="pd-summary">
                <div className="pd-sum-card total"><span className="pd-sum-label">Deuda Total</span><span className="pd-sum-value">{fmt(totalDebt, currency)}</span></div>
                <div className="pd-sum-card"><span className="pd-sum-label">Pago Mínimo Mensual</span><span className="pd-sum-value">{fmt(totalMinPayment, currency)}</span></div>
                <div className="pd-sum-card"><span className="pd-sum-label">Deudas Activas</span><span className="pd-sum-value">{debts.length}</span></div>
            </div>

            {/* Extra Payment Slider */}
            <div className="pd-extra-card">
                <div className="pd-extra-header">
                    <DollarSign size={20} />
                    <span>Pago extra mensual</span>
                </div>
                <input type="range" min="0" max={Math.round(totalMinPayment * 2)} step={Math.round(totalMinPayment / 20) || 1000}
                    value={extraPayment} onChange={e => setExtraPayment(Number(e.target.value))} className="pd-slider" title="Pago extra" />
                <div className="pd-extra-value">{fmt(extraPayment, currency)}/mes extra</div>
            </div>

            {/* Strategy Comparison */}
            <div className="pd-strategies">
                {[snowball, avalanche].map((result, i) => (
                    <div key={i} className={`pd-strategy-card ${i === 0 ? 'snowball' : 'avalanche'}`}>
                        <div className="pd-strat-header">
                            {i === 0 ? <ArrowUp size={20} /> : <ArrowDown size={20} />}
                            <h3>{result.name}</h3>
                        </div>
                        <p className="pd-strat-desc">{i === 0 ? 'Paga primero la deuda más pequeña' : 'Paga primero la deuda con mayor interés'}</p>
                        <div className="pd-strat-stats">
                            <div className="pd-stat"><span className="pd-stat-num">{result.months}</span><span className="pd-stat-label">meses</span></div>
                            <div className="pd-stat"><span className="pd-stat-num">{fmt(result.totalPaid, currency)}</span><span className="pd-stat-label">total pagado</span></div>
                            <div className="pd-stat"><span className="pd-stat-num">{fmt(result.totalInterest, currency)}</span><span className="pd-stat-label">en intereses</span></div>
                        </div>
                        {avalanche.totalInterest < snowball.totalInterest && i === 1 && (
                            <div className="pd-savings">Ahorras {fmt(snowball.totalInterest - avalanche.totalInterest, currency)} en intereses</div>
                        )}
                    </div>
                ))}
            </div>

            {/* Chart */}
            <div className="pd-chart-card">
                <h3>Proyección de Saldo</h3>
                <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                        <XAxis dataKey="mes" stroke="#94A3B8" fontSize={11} />
                        <YAxis stroke="#94A3B8" fontSize={11} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(v: unknown) => [fmt(Number(v), currency), '']} />
                        <Legend />
                        <Bar dataKey="Bola de Nieve" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Avalancha" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Debt Order */}
            <div className="pd-order">
                <div className="pd-order-card">
                    <h3>Orden: Bola de Nieve (menor saldo primero)</h3>
                    {[...debts].sort((a, b) => Number(a.remaining_amount) - Number(b.remaining_amount)).map((d, i) => (
                        <div key={d.id} className="pd-order-item"><span className="pd-order-num">{i + 1}</span><span>{d.name}</span><span className="pd-order-amount">{fmt(Number(d.remaining_amount), currency)}</span></div>
                    ))}
                </div>
                <div className="pd-order-card">
                    <h3>Orden: Avalancha (mayor interés primero)</h3>
                    {[...debts].sort((a, b) => Number(b.interest_rate) - Number(a.interest_rate)).map((d, i) => (
                        <div key={d.id} className="pd-order-item"><span className="pd-order-num">{i + 1}</span><span>{d.name}</span><span className="pd-order-rate">{d.interest_rate}%</span></div>
                    ))}
                </div>
            </div>
        </div>
    );
}
