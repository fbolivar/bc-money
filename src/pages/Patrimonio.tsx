import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, Calendar } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { supabase } from '../lib/supabase';
import type { Account, Debt, NetWorthSnapshot } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, startOfMonth } from 'date-fns';
import { parseLocalDate } from '../lib/dates';
import { es } from 'date-fns/locale';
import './Patrimonio.css';

function fmt(n: number, c: string) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: c, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n); }

interface NetWorthHistory {
    id: string;
    user_id: string;
    snapshot_date: string;
    total_assets: number;
    total_liabilities: number;
    net_worth: number;
    created_at: string;
}

export function Patrimonio() {
    const { user, profile } = useAuth();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [debts, setDebts] = useState<Debt[]>([]);
    const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);
    const [history, setHistory] = useState<NetWorthHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingHistory, setSavingHistory] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const currency = profile?.currency || 'COP';
    const showToast = useCallback((msg: string, type: 'success' | 'error') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }, []);

    const fetchData = useCallback(async () => {
        if (!user) return;
        const [aRes, dRes, sRes, hRes] = await Promise.all([
            supabase.from('accounts').select('*').eq('user_id', user.id),
            supabase.from('debts').select('*').eq('user_id', user.id).eq('status', 'active'),
            supabase.from('net_worth_snapshots').select('*').eq('user_id', user.id).order('date', { ascending: true }),
            supabase.from('net_worth_history').select('*').eq('user_id', user.id).order('snapshot_date', { ascending: true }).limit(12),
        ]);
        setAccounts(aRes.data || []);
        setDebts(dRes.data || []);
        setSnapshots(sRes.data || []);
        setHistory(hRes.data || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

    const totalAssets = useMemo(() => accounts.reduce((s, a) => s + Math.max(Number(a.balance), 0), 0), [accounts]);
    const totalLiabilities = useMemo(() => debts.reduce((s, d) => s + Number(d.remaining_amount), 0), [debts]);
    const netWorth = totalAssets - totalLiabilities;

    const lastSnapshot = snapshots[snapshots.length - 1];
    const change = lastSnapshot ? netWorth - Number(lastSnapshot.net_worth) : 0;

    const chartData = useMemo(() => {
        const data = snapshots.map(s => ({
            date: format(parseLocalDate(s.date), 'd MMM', { locale: es }),
            patrimonio: Number(s.net_worth),
            activos: Number(s.total_assets),
            pasivos: Number(s.total_liabilities),
        }));
        data.push({ date: 'Hoy', patrimonio: netWorth, activos: totalAssets, pasivos: totalLiabilities });
        return data;
    }, [snapshots, netWorth, totalAssets, totalLiabilities]);

    const historyChartData = useMemo(() => {
        return history.map(h => ({
            date: format(parseLocalDate(h.snapshot_date), 'MMM yy', { locale: es }),
            activos: Number(h.total_assets),
            pasivos: Number(h.total_liabilities),
            patrimonio: Number(h.net_worth),
        }));
    }, [history]);

    const upsertMonthlySnapshot = useCallback(async (assets: number, liabilities: number) => {
        if (!user) return;
        const firstOfMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');
        await supabase.from('net_worth_history').upsert(
            { user_id: user.id, snapshot_date: firstOfMonth, total_assets: assets, total_liabilities: liabilities },
            { onConflict: 'user_id,snapshot_date' }
        );
    }, [user]);

    useEffect(() => {
        if (!user || loading) return;
        const firstOfMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');
        const alreadyExists = history.some(h => h.snapshot_date === firstOfMonth);
        if (!alreadyExists) {
            upsertMonthlySnapshot(totalAssets, totalLiabilities).then(() => {
                supabase.from('net_worth_history').select('*').eq('user_id', user.id).order('snapshot_date', { ascending: true }).limit(12).then(({ data }) => {
                    setHistory(data || []);
                });
            });
        }
    }, [user, loading, history, totalAssets, totalLiabilities, upsertMonthlySnapshot]);

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

    const forceHistorySnapshot = async () => {
        if (!user) return;
        setSavingHistory(true);
        const firstOfMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');
        const { error } = await supabase.from('net_worth_history').upsert(
            { user_id: user.id, snapshot_date: firstOfMonth, total_assets: totalAssets, total_liabilities: totalLiabilities },
            { onConflict: 'user_id,snapshot_date' }
        );
        if (error) { showToast('Error al guardar', 'error'); } else { showToast('Snapshot mensual actualizado', 'success'); fetchData(); }
        setSavingHistory(false);
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

            <div className="pat-chart-card">
                <div className="pat-history-header">
                    <div>
                        <h3>Evolución histórica</h3>
                        <p className="pat-history-subtitle">Registro mensual automático del primer día de cada mes</p>
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={forceHistorySnapshot} disabled={savingHistory}>
                        <Calendar size={14} /> {savingHistory ? 'Guardando...' : 'Registrar snapshot ahora'}
                    </button>
                </div>
                {historyChartData.length < 2 ? (
                    <div className="pat-history-empty">
                        <Calendar size={32} />
                        <p>Se irá construyendo mes a mes automáticamente</p>
                        <span>El primer snapshot se registró este mes. Vuelve el mes próximo para ver la evolución.</span>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={historyChartData}>
                            <defs>
                                <linearGradient id="gradAssets" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gradLiabilities" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gradHistory" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                            <XAxis dataKey="date" stroke="#94A3B8" fontSize={11} />
                            <YAxis stroke="#94A3B8" fontSize={11} />
                            <Tooltip
                                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                formatter={(v: unknown, name: string) => [fmt(Number(v), currency), name]}
                            />
                            <Legend />
                            <Area type="monotone" dataKey="activos" stroke="#3B82F6" fill="url(#gradAssets)" strokeWidth={2} name="Activos" />
                            <Area type="monotone" dataKey="pasivos" stroke="#EF4444" fill="url(#gradLiabilities)" strokeWidth={2} name="Pasivos" />
                            <Area type="monotone" dataKey="patrimonio" stroke="#10B981" fill="url(#gradHistory)" strokeWidth={2} name="Patrimonio neto" />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>

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

            {snapshots.length > 0 && (
                <div className="pat-history">
                    <h3>Historial de Snapshots ({snapshots.length})</h3>
                    <div className="pat-history-list">
                        {[...snapshots].reverse().slice(0, 10).map(s => (
                            <div key={s.id} className="pat-history-row">
                                <span className="ph-date">{format(parseLocalDate(s.date), 'd MMM yyyy', { locale: es })}</span>
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
