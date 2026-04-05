import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
    ChevronRight, ChevronLeft, Check, Landmark, Wallet, Target,
    BarChart3, ShieldCheck, CalendarDays, PawPrint, ShoppingCart,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import './Onboarding.css';

const CURRENCIES = [
    { value: 'COP', label: 'COP - Peso colombiano', flag: '' },
    { value: 'USD', label: 'USD - Dólar', flag: '' },
    { value: 'EUR', label: 'EUR - Euro', flag: '' },
    { value: 'MXN', label: 'MXN - Peso mexicano', flag: '' },
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

export function Onboarding() {
    const { user, loading: authLoading, refreshProfile } = useAuth();
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);

    const [currency, setCurrency] = useState('COP');
    const [accountName, setAccountName] = useState('');
    const [accountType, setAccountType] = useState('savings');
    const [accountBalance, setAccountBalance] = useState('');

    if (authLoading) return <div className="loading-screen"><div className="loading-spinner"></div></div>;
    if (!user) return <Navigate to="/login" replace />;

    const handleComplete = async () => {
        if (!user) return;
        setSaving(true);

        // Save currency
        await supabase.from('profiles').update({
            currency,
            onboarding_completed: true,
            onboarding_step: 3,
        }).eq('id', user.id);

        // Create first account if provided
        if (accountName.trim()) {
            await supabase.from('accounts').insert({
                user_id: user.id,
                name: accountName,
                type: accountType,
                currency,
                balance: parseFloat(accountBalance) || 0,
            });
        }

        await refreshProfile();
        navigate('/');
        setSaving(false);
    };

    return (
        <div className="ob-page">
            <div className="ob-container">
                {/* Logo */}
                <img src="/icon.svg" alt="BC Money" className="ob-logo" />

                {/* Progress */}
                <div className="ob-progress">
                    {[1, 2, 3].map(s => (
                        <div key={s} className={`ob-dot ${step >= s ? 'active' : ''} ${step > s ? 'done' : ''}`}>
                            {step > s ? <Check size={12} /> : s}
                        </div>
                    ))}
                </div>

                {/* Step 1: Welcome + Currency */}
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

                {/* Step 2: First Account */}
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

                {/* Step 3: Quick Tour */}
                {step === 3 && (
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

                {/* Actions */}
                <div className="ob-actions">
                    {step > 1 && (
                        <button type="button" className="ob-btn-back" onClick={() => setStep(s => s - 1)}>
                            <ChevronLeft size={18} /> Atrás
                        </button>
                    )}
                    {step < 3 ? (
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
