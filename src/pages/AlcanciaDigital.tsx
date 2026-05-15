import { useState, useEffect, useCallback } from 'react';
import { Coins, PiggyBank, RefreshCw, Check, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Goal } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { subDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import './AlcanciaDigital.css';

const LS_KEY = 'alcancia_settings';
interface Settings {
    enabled: boolean;
    goalId: string;
    roundTo: number; // round-up to nearest N (e.g. 1000 COP)
    appliedTxIds: string[];
}

function defaultSettings(): Settings {
    return { enabled: false, goalId: '', roundTo: 1000, appliedTxIds: [] };
}

function loadSettings(): Settings {
    try { return { ...defaultSettings(), ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }; }
    catch { return defaultSettings(); }
}

function saveSettings(s: Settings) {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
}

function calcRoundup(amount: number, roundTo: number): number {
    const rem = amount % roundTo;
    return rem === 0 ? 0 : roundTo - rem;
}

function fmtMoney(n: number, currency: string) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

export function AlcanciaDigital() {
    const { user, profile } = useAuth();
    const currency = profile?.currency || 'COP';
    const [settings, setSettings] = useState<Settings>(loadSettings);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [pendingTx, setPendingTx] = useState<{ id: string; desc: string; amount: number; roundup: number; date: string }[]>([]);
    const [totalPending, setTotalPending] = useState(0);
    const [totalApplied, setTotalApplied] = useState(0);
    const [applying, setApplying] = useState(false);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState('');

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const { data: gs } = await supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active');
        setGoals((gs as Goal[]) || []);

        // Load last 30 days of expenses
        const s = loadSettings();
        const since = subDays(new Date(), 30).toISOString().slice(0, 10);
        const { data: txs } = await supabase
            .from('transactions')
            .select('id, amount, description, date, category_id')
            .eq('user_id', user.id)
            .eq('type', 'expense')
            .gte('date', since)
            .order('date', { ascending: false });

        const pending = [];
        let sumPending = 0;
        let sumApplied = 0;

        for (const t of txs || []) {
            const ru = calcRoundup(Number(t.amount), s.roundTo);
            if (ru <= 0) continue;
            if (s.appliedTxIds.includes(t.id)) {
                sumApplied += ru;
            } else {
                sumPending += ru;
                pending.push({
                    id: t.id,
                    desc: t.description || 'Gasto',
                    amount: Number(t.amount),
                    roundup: ru,
                    date: t.date,
                });
            }
        }

        setPendingTx(pending.slice(0, 20));
        setTotalPending(sumPending);
        setTotalApplied(sumApplied);
        setLoading(false);
    }, [user]);

    useEffect(() => { load(); }, [load]);

    const updateSettings = (patch: Partial<Settings>) => {
        const next = { ...settings, ...patch };
        setSettings(next);
        saveSettings(next);
    };

    const applyRoundups = async () => {
        if (!user || !settings.goalId || totalPending === 0) return;
        setApplying(true);

        const goal = goals.find(g => g.id === settings.goalId);
        if (goal) {
            const newAmount = Number(goal.current_amount) + totalPending;
            await supabase.from('goals').update({ current_amount: newAmount }).eq('id', settings.goalId);
        }

        const newApplied = [...settings.appliedTxIds, ...pendingTx.map(t => t.id)];
        updateSettings({ appliedTxIds: newApplied });
        showToast(`¡${fmtMoney(totalPending, currency)} enviados a tu meta de ahorro!`);
        setApplying(false);
        load();
    };

    const selectedGoal = goals.find(g => g.id === settings.goalId);
    const ROUND_OPTIONS = currency === 'COP'
        ? [{ v: 500, l: '$500' }, { v: 1000, l: '$1.000' }, { v: 2000, l: '$2.000' }, { v: 5000, l: '$5.000' }, { v: 10000, l: '$10.000' }]
        : [{ v: 1, l: '$1' }, { v: 5, l: '$5' }, { v: 10, l: '$10' }, { v: 25, l: '$25' }];

    return (
        <div className="alc-page animate-fadeIn">
            {toast && <div className="alc-toast">{toast}</div>}

            <div className="alc-header">
                <div>
                    <h1><Coins size={22} /> Alcancía Digital</h1>
                    <p>Redondea tus gastos y ahorra sin esfuerzo</p>
                </div>
                <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
                    <RefreshCw size={15} className={loading ? 'spin' : ''} />
                </button>
            </div>

            {/* How it works */}
            <div className="alc-card alc-how">
                <h2>¿Cómo funciona?</h2>
                <p>
                    Por cada gasto que registres, redondeamos al siguiente múltiplo
                    y acumulamos la diferencia. Ej: si gastas <strong>{fmtMoney(47200, currency)}</strong>,
                    la alcancía ahorra <strong>{fmtMoney(800, currency)}</strong> para tu meta.
                </p>
            </div>

            {/* Settings */}
            <div className="alc-card">
                <h2>Configuración</h2>
                <div className="alc-settings">
                    <label className="alc-toggle-row">
                        <span>Activar alcancía digital</span>
                        <input type="checkbox" className="alc-toggle"
                            checked={settings.enabled}
                            onChange={e => updateSettings({ enabled: e.target.checked })} />
                    </label>

                    <div className="alc-field">
                        <label>Redondear al siguiente...</label>
                        <div className="alc-round-grid">
                            {ROUND_OPTIONS.map(o => (
                                <button key={o.v} type="button"
                                    className={`alc-round-btn ${settings.roundTo === o.v ? 'active' : ''}`}
                                    onClick={() => updateSettings({ roundTo: o.v })}>
                                    {o.l}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="alc-field">
                        <label>Meta de ahorro destino</label>
                        <select className="form-input" title="Meta de ahorro"
                            value={settings.goalId}
                            onChange={e => updateSettings({ goalId: e.target.value })}>
                            <option value="">Seleccionar meta...</option>
                            {goals.map(g => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                        </select>
                        {goals.length === 0 && (
                            <span className="alc-hint">Crea una meta en la sección "Metas" primero</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="alc-stats">
                <div className="alc-stat blue">
                    <TrendingUp size={20} />
                    <div>
                        <span>Acumulado aplicado</span>
                        <strong>{fmtMoney(totalApplied, currency)}</strong>
                    </div>
                </div>
                <div className="alc-stat green">
                    <PiggyBank size={20} />
                    <div>
                        <span>Listo para aplicar</span>
                        <strong>{fmtMoney(totalPending, currency)}</strong>
                    </div>
                </div>
                {selectedGoal && (
                    <div className="alc-stat purple">
                        <Coins size={20} />
                        <div>
                            <span>Meta: {selectedGoal.name}</span>
                            <strong>
                                {fmtMoney(Number(selectedGoal.current_amount), currency)} / {fmtMoney(Number(selectedGoal.target_amount), currency)}
                            </strong>
                        </div>
                    </div>
                )}
            </div>

            {/* Apply button */}
            {totalPending > 0 && settings.goalId && (
                <div className="alc-apply-section">
                    <button type="button" className="btn btn-primary alc-apply-btn" onClick={applyRoundups} disabled={applying}>
                        <Check size={16} />
                        {applying ? 'Aplicando...' : `Enviar ${fmtMoney(totalPending, currency)} a mi meta`}
                    </button>
                </div>
            )}

            {/* Pending transactions */}
            {pendingTx.length > 0 && (
                <div className="alc-card">
                    <h2>Redondeos pendientes (últimos 30 días)</h2>
                    <div className="alc-tx-list">
                        {pendingTx.map(t => (
                            <div key={t.id} className="alc-tx-item">
                                <div className="alc-tx-info">
                                    <span className="alc-tx-desc">{t.desc}</span>
                                    <span className="alc-tx-date">{format(new Date(t.date), 'd MMM', { locale: es })}</span>
                                </div>
                                <div className="alc-tx-amounts">
                                    <span className="alc-tx-orig">{fmtMoney(t.amount, currency)}</span>
                                    <span className="alc-tx-roundup">+{fmtMoney(t.roundup, currency)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!loading && pendingTx.length === 0 && totalApplied === 0 && (
                <div className="alc-empty">
                    <Coins size={48} strokeWidth={1} />
                    <p>Registra gastos para que la alcancía empiece a calcular tus redondeos</p>
                </div>
            )}
        </div>
    );
}
