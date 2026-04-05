import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import type { Account, Debt, NetWorthSnapshot } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import './Patrimonio.css';

function fmt(n: number, c: string) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: c, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n); }

export function Patrimonio() {
    const { user, profile } = useAuth();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [debts, setDebts] = useState<Debt[]>([]);
    const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const currency = profile?.currency || 'COP';
    const showToast = useCallback((msg: string, type: 'success' | 'error') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }, []);

    const fetchData = useCallback(async () => {
        if (!user) return;
        const [aRes, dRes, sRes] = await Promise.all([
            supabase.from('accounts').select('*').eq('user_id', user.id),
            supabase.from('debts').select('*').eq('user_id', user.id).eq('status', 'active'),
            supabase.from('net_worth_snapshots').select('*').eq('user_id', user.id).order('date', { ascending: true }),
        ]);
        setAccounts(aRes.data || []); setDebts(dRes.data || []); setSnapshots(sRes.data || []); setLoading(false);
    }, [user]);

    useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

    const totalAssets = useMemo(() => accounts.reduce((s, a) => s + Math.max(Number(a.balance), 0), 0), [accounts]);
    const totalLiabilities = useMemo(() => debts.reduce((s, d) => s + Number(d.remaining_amount), 0), [debts]);
    const netWorth = totalAssets - totalLiabilities;

    const lastSnapshot = snapshots[snapshots.length - 1];
    const change = lastSnapshot ? netWorth - Number(lastSnapshot.net_worth) : 0;

    const chartData = useMemo(() => {
        const data = snapshots.map(s => ({
            date: format(new Date(s.date), 'd MMM', { locale: es }),
            patrimonio: Number(s.net_worth),
            activos: Number(s.total_assets),
            pasivos: Number(s.total_liabilities),
        }));
        // Add current
        data.push({ date: 'Hoy', patrimonio: netWorth, activos: totalAssets, pasivos: totalLiabilities });
        return data;
    }, [snapshots, netWorth, totalAssets, totalLiabilities]);

    const saveSnapshot = async () => {
        if (!user) return;
        setSaving(true);
        const breakdown = {
            accounts: accounts.map(a => ({ name: a.name, balance: Number(a.balance) })),
            debts: debts.map(d => ({ name: d.name, remaining: Number(d.remaining_amount) })),
        };
        await supabase.from('net_worth_snapshots').insert({
            user_id: user.id, date: format(new Date(), 'yyyy-MM-dd'),
            total_assets: totalAssets, total_liabilities: totalLiabilities,
            net_worth: netWorth, breakdown,
        });
        showToast('Snapshot guardado', 'success'); setSaving(false); fetchData();
    };

    if (loading) return <div className="loading-container"><div className="loading-spinner"></div></div>;

    return (
        <div className="patrimonio-page animate-fadeIn">
            {toast && <div className={`pat-toast ${toast.type}`}>{toast.msg}</div>}

            <div className="pat-header">
                <div><h1>Patrimonio Neto</h1><p>Seguimiento de tu riqueza total en el tiempo</p></div>
                <button className="btn btn-primary" onClick={saveSnapshot} disabled={saving}>
                    <RefreshCw size={16} /> {saving ? 'Guardando...' : 'Guardar Snapshot'}
                </button>
            </div>

            {/* Summary Cards */}
            <div className="pat-summary">
                <div className="pat-card main">
                    <span className="pat-label">Patrimonio Neto</span>
                    <span className={`pat-amount ${netWorth >= 0 ? 'positive' : 'negative'}`}>{fmt(netWorth, currency)}</span>
                    {change !== 0 && (
                        <span className={`pat-change ${change >= 0 ? 'up' : 'down'}`}>
                            {change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            {fmt(Math.abs(change), currency)} vs último registro
                        </span>
                    )}
                </div>
                <div className="pat-card assets">
                    <span className="pat-label">Total Activos</span>
                    <span className="pat-amount">{fmt(totalAssets, currency)}</span>
                    <span className="pat-sub">{accounts.length} cuentas</span>
                </div>
                <div className="pat-card liabilities">
                    <span className="pat-label">Total Pasivos</span>
                    <span className="pat-amount">{fmt(totalLiabilities, currency)}</span>
                    <span className="pat-sub">{debts.length} deudas activas</span>
                </div>
            </div>

            {/* Chart */}
            {chartData.length > 1 && (
                <div className="pat-chart-card">
                    <h3>Evolución del Patrimonio</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="gradNW" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                            <XAxis dataKey="date" stroke="#94A3B8" fontSize={11} />
                            <YAxis stroke="#94A3B8" fontSize={11} />
                            <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(v: unknown) => [fmt(Number(v), currency), '']} />
                            <Area type="monotone" dataKey="patrimonio" stroke="#4F46E5" fill="url(#gradNW)" strokeWidth={2} name="Patrimonio" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Detail Tables */}
            <div className="pat-details">
                <div className="pat-detail-card">
                    <h3>Activos</h3>
                    {accounts.length > 0 ? accounts.map(a => (
                        <div key={a.id} className="pat-row">
                            <span className="pat-row-name">{a.name}</span>
                            <span className="pat-row-amount positive">{fmt(Number(a.balance), currency)}</span>
                        </div>
                    )) : <p className="pat-empty">Sin cuentas registradas</p>}
                    <div className="pat-row total"><span>Total Activos</span><span className="positive">{fmt(totalAssets, currency)}</span></div>
                </div>

                <div className="pat-detail-card">
                    <h3>Pasivos</h3>
                    {debts.length > 0 ? debts.map(d => (
                        <div key={d.id} className="pat-row">
                            <span className="pat-row-name">{d.name}</span>
                            <span className="pat-row-amount negative">{fmt(Number(d.remaining_amount), currency)}</span>
                        </div>
                    )) : <p className="pat-empty">Sin deudas activas</p>}
                    <div className="pat-row total"><span>Total Pasivos</span><span className="negative">{fmt(totalLiabilities, currency)}</span></div>
                </div>
            </div>

            {/* History */}
            {snapshots.length > 0 && (
                <div className="pat-history">
                    <h3>Historial de Snapshots ({snapshots.length})</h3>
                    <div className="pat-history-list">
                        {[...snapshots].reverse().slice(0, 10).map(s => (
                            <div key={s.id} className="pat-history-row">
                                <span className="ph-date">{format(new Date(s.date), 'd MMM yyyy', { locale: es })}</span>
                                <span className={`ph-nw ${Number(s.net_worth) >= 0 ? 'positive' : 'negative'}`}>{fmt(Number(s.net_worth), currency)}</span>
                                <span className="ph-assets">{fmt(Number(s.total_assets), currency)}</span>
                                <span className="ph-liabilities">{fmt(Number(s.total_liabilities), currency)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
