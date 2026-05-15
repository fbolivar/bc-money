import { useState, useMemo } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
    ChevronRight, ChevronLeft, Check, Landmark, Wallet, Target,
    BarChart3, ShieldCheck, CalendarDays, PawPrint, ShoppingCart,
    Sparkles, CheckCircle2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import './Onboarding.css';

const SMMLV_COP = 1_423_500; // 2025
const TOTAL_STEPS = 4;

const CURRENCIES = [
    { value: 'COP', label: 'COP - Peso colombiano' },
    { value: 'USD', label: 'USD - Dólar' },
    { value: 'EUR', label: 'EUR - Euro' },
    { value: 'MXN', label: 'MXN - Peso mexicano' },
];

const ACCOUNT_TYPES = [
    { value: 'checking', label: 'Cuenta Corriente' },
    { value: 'savings', label: 'Cuenta de Ahorro' },
    { value: 'cash', label: 'Efectivo' },
    { value: 'credit_card', label: 'Tarjeta de Crédito' },
];

const APP_FEATURES = [
    { icon: Wallet, label: 'Presupuestos', desc: 'Controla cuánto gastas' },
    { icon: Target, label: 'Metas de ahorro', desc: 'Ahorra con objetivos claros' },
    { icon: BarChart3, label: 'Inversiones', desc: 'Sigue tu portfolio' },
    { icon: ShieldCheck, label: 'Garantías', desc: 'No pierdas cobertura' },
    { icon: CalendarDays, label: 'Calendario', desc: 'Pagos y vencimientos' },
    { icon: ShoppingCart, label: 'Lista de compras', desc: 'Compra con presupuesto' },
    { icon: PawPrint, label: 'Mascotas', desc: 'Gastos veterinarios' },
    { icon: Landmark, label: 'Deudas', desc: 'Planifica tu libertad' },
];

// Sugerencias de presupuesto según regla 50/30/20 colombiana
function buildBudgetSuggestions(income: number, currency: string) {
    const isCOP = currency === 'COP';
    const round = (n: number) => isCOP ? Math.round(n / 10_000) * 10_000 : Math.round(n / 10) * 10;
    return [
        { name: 'Vivienda / Arriendo', pct: 30, amount: round(income * 0.30), color: '#3B82F6', emoji: '🏠' },
        { name: 'Alimentación', pct: 15, amount: round(income * 0.15), color: '#10B981', emoji: '🛒' },
        { name: 'Transporte', pct: 10, amount: round(income * 0.10), color: '#F59E0B', emoji: '🚌' },
        { name: 'Salud', pct: 5, amount: round(income * 0.05), color: '#EF4444', emoji: '💊' },
        { name: 'Entretenimiento', pct: 10, amount: round(income * 0.10), color: '#8B5CF6', emoji: '🎭' },
        { name: 'Ropa y personal', pct: 5, amount: round(income * 0.05), color: '#EC4899', emoji: '👕' },
        { name: 'Ahorro / Inversión', pct: 20, amount: round(income * 0.20), color: '#14B8A6', emoji: '💰' },
        { name: 'Otros', pct: 5, amount: round(income * 0.05), color: '#6B7280', emoji: '📦' },
    ];
}

export function Onboarding() {
    const { user, loading: authLoading, refreshProfile } = useAuth();
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);

    // Step 1
    const [currency, setCurrency] = useState('COP');
    // Step 2
    const [accountName, setAccountName] = useState('');
    const [accountType, setAccountType] = useState('savings');
    const [accountBalance, setAccountBalance] = useState('');
    // Step 3 — presupuesto inteligente
    const [monthlyIncome, setMonthlyIncome] = useState('');
    const [selectedBudgets, setSelectedBudgets] = useState<Set<number>>(new Set([0, 1, 2, 3, 6]));

    const incomeNum = parseFloat(monthlyIncome.replace(/\./g, '').replace(',', '.')) || 0;
    const isCOP = currency === 'COP';
    const smmlvCount = isCOP && incomeNum > 0 ? (incomeNum / SMMLV_COP).toFixed(1) : null;

    const suggestions = useMemo(
        () => incomeNum > 0 ? buildBudgetSuggestions(incomeNum, currency) : [],
        [incomeNum, currency],
    );

    const toggleBudget = (i: number) => setSelectedBudgets(prev => {
        const next = new Set(prev);
        next.has(i) ? next.delete(i) : next.add(i);
        return next;
    });

    if (authLoading) return <div className="loading-screen"><div className="loading-spinner"></div></div>;
    if (!user) return <Navigate to="/login" replace />;

    const handleComplete = async () => {
        if (!user) return;
        setSaving(true);

        await supabase.from('profiles').update({
            currency,
            onboarding_completed: true,
            onboarding_step: TOTAL_STEPS,
        }).eq('id', user.id);

        if (accountName.trim()) {
            await supabase.from('accounts').insert({
                user_id: user.id,
                name: accountName,
                type: accountType,
                currency,
                balance: parseFloat(accountBalance) || 0,
            });
        }

        // Crear presupuestos seleccionados si hay sugerencias
        if (suggestions.length > 0 && selectedBudgets.size > 0) {
            const toCreate = suggestions
                .filter((_, i) => selectedBudgets.has(i))
                .filter(s => s.name !== 'Ahorro / Inversión'); // Ahorro = meta, no presupuesto

            // Obtener o crear categorías del sistema
            for (const s of toCreate) {
                const { data: existingCat } = await supabase
                    .from('categories')
                    .select('id')
                    .eq('name', s.name)
                    .or(`user_id.eq.${user.id},is_system.eq.true`)
                    .single();

                let catId = existingCat?.id;
                if (!catId) {
                    const { data: newCat } = await supabase
                        .from('categories')
                        .insert({ user_id: user.id, name: s.name, type: 'expense', color: s.color, icon: s.emoji })
                        .select('id')
                        .single();
                    catId = newCat?.id;
                }
                if (catId) {
                    await supabase.from('budgets').insert({
                        user_id: user.id,
                        category_id: catId,
                        amount: s.amount,
                        period: 'monthly',
                    });
                }
            }

            // Meta de ahorro si está seleccionada
            if (selectedBudgets.has(6)) {
                const savSug = suggestions[6];
                await supabase.from('goals').insert({
                    user_id: user.id,
                    name: 'Ahorro mensual',
                    target_amount: savSug.amount * 12,
                    current_amount: 0,
                    currency,
                    deadline: new Date(new Date().getFullYear() + 1, new Date().getMonth(), 1).toISOString().slice(0, 10),
                });
            }
        }

        await refreshProfile();
        navigate('/');
        setSaving(false);
    };

    return (
        <div className="ob-page">
            <div className="ob-container">
                <img src="/icon.svg" alt="BC Money" className="ob-logo" />

                <div className="ob-progress">
                    {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(s => (
                        <div key={s} className={`ob-dot ${step >= s ? 'active' : ''} ${step > s ? 'done' : ''}`}>
                            {step > s ? <Check size={12} /> : s}
                        </div>
                    ))}
                </div>

                {/* Step 1: Moneda */}
                {step === 1 && (
                    <div className="ob-step animate-slideIn">
                        <h1>Bienvenido a BC Money</h1>
                        <p>Configura lo básico para empezar</p>
                        <div className="ob-field">
                            <label>Tu moneda principal</label>
                            <div className="ob-currency-grid">
                                {CURRENCIES.map(c => (
                                    <button key={c.value} type="button"
                                        className={`ob-currency-btn ${currency === c.value ? 'selected' : ''}`}
                                        onClick={() => setCurrency(c.value)}>
                                        <span className="ob-cur-code">{c.value}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 2: Primera cuenta */}
                {step === 2 && (
                    <div className="ob-step animate-slideIn">
                        <h1>Tu primera cuenta</h1>
                        <p>Registra tu cuenta principal (opcional)</p>
                        <div className="ob-field">
                            <label>Nombre de la cuenta</label>
                            <input type="text" className="ob-input" value={accountName}
                                onChange={e => setAccountName(e.target.value)}
                                placeholder="Ej: Bancolombia Ahorro" />
                        </div>
                        <div className="ob-field-row">
                            <div className="ob-field">
                                <label>Tipo</label>
                                <select className="ob-input" value={accountType}
                                    onChange={e => setAccountType(e.target.value)} title="Tipo de cuenta">
                                    {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            <div className="ob-field">
                                <label>Saldo actual ({currency})</label>
                                <input type="number" className="ob-input" value={accountBalance}
                                    onChange={e => setAccountBalance(e.target.value)}
                                    placeholder="0" min="0" />
                            </div>
                        </div>
                        <button type="button" className="ob-skip" onClick={() => { setAccountName(''); setStep(3); }}>
                            Saltar este paso
                        </button>
                    </div>
                )}

                {/* Step 3: Presupuesto inteligente */}
                {step === 3 && (
                    <div className="ob-step animate-slideIn">
                        <div className="ob-smart-header">
                            <Sparkles size={22} />
                            <div>
                                <h1>Presupuesto inteligente</h1>
                                <p>Te sugerimos un plan basado en tu ingreso</p>
                            </div>
                        </div>

                        <div className="ob-field">
                            <label>Ingreso mensual ({currency})</label>
                            <input
                                type="text"
                                className="ob-input"
                                placeholder={isCOP ? 'Ej: 3.500.000' : 'Ej: 2000'}
                                value={monthlyIncome}
                                onChange={e => setMonthlyIncome(e.target.value)}
                            />
                            {smmlvCount && (
                                <span className="ob-smmlv-hint">{smmlvCount} SMMLV · Regla 50/30/20 adaptada</span>
                            )}
                        </div>

                        {suggestions.length > 0 && (
                            <div className="ob-budget-list">
                                <p className="ob-budget-list-label">Selecciona los presupuestos a crear:</p>
                                {suggestions.map((s, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        className={`ob-budget-item ${selectedBudgets.has(i) ? 'selected' : ''}`}
                                        onClick={() => toggleBudget(i)}
                                    >
                                        <span className="ob-budget-emoji">{s.emoji}</span>
                                        <div className="ob-budget-info">
                                            <strong>{s.name}</strong>
                                            <span>{currency} {s.amount.toLocaleString()} · {s.pct}%</span>
                                        </div>
                                        <div className="ob-budget-check">
                                            {selectedBudgets.has(i) && <CheckCircle2 size={18} />}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {suggestions.length === 0 && (
                            <p className="ob-budget-empty">Ingresa tu ingreso mensual para ver las sugerencias</p>
                        )}

                        <button type="button" className="ob-skip" onClick={() => setStep(4)}>
                            Saltar este paso
                        </button>
                    </div>
                )}

                {/* Step 4: Tour rápido */}
                {step === 4 && (
                    <div className="ob-step animate-slideIn">
                        <h1>Todo listo</h1>
                        <p>Esto es lo que puedes hacer con BC Money</p>
                        <div className="ob-features">
                            {APP_FEATURES.map((f, i) => (
                                <div key={i} className="ob-feature">
                                    <f.icon size={20} />
                                    <div>
                                        <strong>{f.label}</strong>
                                        <span>{f.desc}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="ob-actions">
                    {step > 1 && (
                        <button type="button" className="ob-btn-back" onClick={() => setStep(s => s - 1)}>
                            <ChevronLeft size={18} /> Atrás
                        </button>
                    )}
                    {step < TOTAL_STEPS ? (
                        <button type="button" className="ob-btn-next" onClick={() => setStep(s => s + 1)}>
                            Continuar <ChevronRight size={18} />
                        </button>
                    ) : (
                        <button type="button" className="ob-btn-next" onClick={handleComplete} disabled={saving}>
                            {saving ? 'Preparando...' : 'Comenzar'} <ChevronRight size={18} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
