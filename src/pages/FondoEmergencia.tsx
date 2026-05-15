import { useState, useEffect, useCallback, useMemo } from 'react';
import { ShieldCheck, TrendingDown, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Account } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import './FondoEmergencia.css';

const STORAGE_KEY = 'bc-emergency-fund';

interface EmergencyFundConfig {
    selectedAccountIds: string[];
    targetMonths: number;
}

function loadConfig(): EmergencyFundConfig {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as EmergencyFundConfig;
    } catch {
        // ignore
    }
    return { selectedAccountIds: [], targetMonths: 6 };
}

function saveConfig(config: EmergencyFundConfig) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function formatMoney(amount: number, currency: string) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(amount);
}

function motivationalMessage(pct: number): string {
    if (pct >= 100) return '¡Meta alcanzada!';
    if (pct >= 75) return '¡Casi!';
    if (pct >= 50) return 'Va muy bien';
    if (pct >= 25) return 'Buen inicio';
    return 'Empezando';
}

function motivationalClass(pct: number): string {
    if (pct >= 100) return 'msg-complete';
    if (pct >= 75) return 'msg-great';
    if (pct >= 50) return 'msg-good';
    if (pct >= 25) return 'msg-start';
    return 'msg-begin';
}

const MONTH_OPTIONS = [3, 6, 9, 12] as const;

export function FondoEmergencia() {
    const { user, profile } = useAuth();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [avgMonthlyExpense, setAvgMonthlyExpense] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [config, setConfig] = useState<EmergencyFundConfig>(loadConfig);

    const currency = profile?.currency || 'COP';

    const fetchData = useCallback(async () => {
        if (!user) return;
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const dateStr = threeMonthsAgo.toISOString().split('T')[0];

        const [accountsRes, txRes] = await Promise.all([
            supabase
                .from('accounts')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: true }),
            supabase
                .from('transactions')
                .select('amount, date')
                .eq('user_id', user.id)
                .eq('type', 'expense')
                .gte('date', dateStr),
        ]);

        if (accountsRes.data) setAccounts(accountsRes.data);

        if (txRes.data && txRes.data.length > 0) {
            const total = txRes.data.reduce((sum, t) => sum + Number(t.amount), 0);
            setAvgMonthlyExpense(total / 3);
        }

        setLoading(false);
    }, [user]);

    useEffect(() => {
        if (user) fetchData();
    }, [user, fetchData]);

    function updateConfig(next: Partial<EmergencyFundConfig>) {
        setConfig(prev => {
            const updated = { ...prev, ...next };
            saveConfig(updated);
            return updated;
        });
    }

    function toggleAccount(id: string) {
        const ids = config.selectedAccountIds.includes(id)
            ? config.selectedAccountIds.filter(x => x !== id)
            : [...config.selectedAccountIds, id];
        updateConfig({ selectedAccountIds: ids });
    }

    const target = useMemo(() => avgMonthlyExpense * config.targetMonths, [avgMonthlyExpense, config.targetMonths]);

    const currentFund = useMemo(() => {
        return accounts
            .filter(a => config.selectedAccountIds.includes(a.id))
            .reduce((sum, a) => sum + a.balance, 0);
    }, [accounts, config.selectedAccountIds]);

    const progressPct = useMemo(() => {
        if (target <= 0) return 0;
        return Math.min((currentFund / target) * 100, 100);
    }, [currentFund, target]);

    if (loading) return <div className="loading-screen">Cargando...</div>;

    return (
        <div className="fe-container">
            <div className="fe-header">
                <ShieldCheck size={32} className="fe-header-icon" />
                <div>
                    <h1>Fondo de Emergencia</h1>
                    <p>Calcula y construye tu red de seguridad financiera</p>
                </div>
            </div>

            <div className="fe-grid">
                <section className="fe-card fe-calculator">
                    <div className="fe-card-title">
                        <TrendingDown size={18} />
                        <span>Calculadora</span>
                    </div>

                    <div className="fe-avg-expense">
                        <span className="fe-label">Promedio de gastos mensuales (últimos 3 meses)</span>
                        <span className="fe-big-number">{formatMoney(avgMonthlyExpense, currency)}</span>
                        {avgMonthlyExpense === 0 && (
                            <p className="fe-hint">No se encontraron gastos en los últimos 3 meses.</p>
                        )}
                    </div>

                    <div className="fe-months-group">
                        <span className="fe-label">¿Cuántos meses quieres cubrir?</span>
                        <div className="fe-months-options">
                            {MONTH_OPTIONS.map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    className={`fe-month-btn ${config.targetMonths === m ? 'selected' : ''}`}
                                    onClick={() => updateConfig({ targetMonths: m })}
                                >
                                    {m} meses
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="fe-target-box">
                        <span className="fe-label">Objetivo de fondo de emergencia</span>
                        <span className="fe-target-amount">{formatMoney(target, currency)}</span>
                        <span className="fe-target-sub">
                            {formatMoney(avgMonthlyExpense, currency)} &times; {config.targetMonths} meses
                        </span>
                    </div>
                </section>

                <section className="fe-card fe-tracking">
                    <div className="fe-card-title">
                        <Wallet size={18} />
                        <span>Seguimiento</span>
                    </div>

                    <div className="fe-accounts-group">
                        <span className="fe-label">Selecciona las cuentas que componen tu fondo</span>
                        <div className="fe-accounts-list">
                            {accounts.length === 0 && (
                                <p className="fe-hint">No tienes cuentas registradas.</p>
                            )}
                            {accounts.map(acc => (
                                <label key={acc.id} className={`fe-account-item ${config.selectedAccountIds.includes(acc.id) ? 'selected' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={config.selectedAccountIds.includes(acc.id)}
                                        onChange={() => toggleAccount(acc.id)}
                                    />
                                    <span className="fe-account-dot" style={{ backgroundColor: acc.color }} />
                                    <span className="fe-account-name">{acc.name}</span>
                                    <span className="fe-account-balance">{formatMoney(acc.balance, acc.currency)}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="fe-progress-section">
                        <div className="fe-progress-header">
                            <span className="fe-label">Progreso actual</span>
                            <span className="fe-pct-label">{progressPct.toFixed(0)}%</span>
                        </div>
                        <div className="fe-progress-bar-track">
                            <div
                                className="fe-progress-bar-fill"
                                style={{ width: `${progressPct}%` }}
                            />
                        </div>
                        <div className="fe-progress-amounts">
                            <span>{formatMoney(currentFund, currency)}</span>
                            <span>{formatMoney(target, currency)}</span>
                        </div>
                        <div className={`fe-motivational ${motivationalClass(progressPct)}`}>
                            {motivationalMessage(progressPct)}
                        </div>
                        {target > 0 && currentFund < target && (
                            <p className="fe-remaining">
                                Falta: <strong>{formatMoney(target - currentFund, currency)}</strong>
                            </p>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
