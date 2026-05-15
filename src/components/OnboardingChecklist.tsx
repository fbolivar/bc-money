import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Circle, X, ArrowRight, Rocket } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import './OnboardingChecklist.css';

const DISMISSED_KEY = 'bc-onboarding-dismissed';

interface StepStatus {
    accounts: boolean;
    transactions: boolean;
    budgets: boolean;
    goals: boolean;
    profile: boolean;
}

interface Step {
    key: keyof StepStatus;
    label: string;
    description: string;
    to: string;
}

const STEPS: Step[] = [
    { key: 'accounts',     label: 'Crea tu primera cuenta',    description: 'Registra una cuenta bancaria o de efectivo',    to: '/cuentas'        },
    { key: 'transactions', label: 'Registra un ingreso o gasto', description: 'Anota tu primera transacción',                to: '/transacciones'  },
    { key: 'budgets',      label: 'Crea un presupuesto',        description: 'Planifica tus gastos por categoría',           to: '/presupuestos'   },
    { key: 'goals',        label: 'Define una meta de ahorro',  description: 'Establece un objetivo financiero',             to: '/metas'          },
    { key: 'profile',      label: 'Configura tu perfil',        description: 'Completa tu información personal',             to: '/configuracion'  },
];

export function OnboardingChecklist() {
    const { user } = useAuth();
    const [dismissed, setDismissed] = useState<boolean>(
        () => localStorage.getItem(DISMISSED_KEY) === 'true'
    );
    const [status, setStatus] = useState<StepStatus>({
        accounts: false,
        transactions: false,
        budgets: false,
        goals: false,
        profile: false,
    });
    const [loading, setLoading] = useState(true);
    const [shouldRender, setShouldRender] = useState(false);
    const [celebrating, setCelebrating] = useState(false);

    useEffect(() => {
        if (dismissed || !user) return;

        async function fetchStatus() {
            const userId = user!.id;
            const [accountsRes, txRes, budgetsRes, goalsRes, profileRes] = await Promise.all([
                supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
                supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
                supabase.from('budgets').select('id', { count: 'exact', head: true }).eq('user_id', userId),
                supabase.from('goals').select('id', { count: 'exact', head: true }).eq('user_id', userId),
                supabase.from('profiles').select('onboarding_completed').eq('id', userId).maybeSingle(),
            ]);

            const accountCount = accountsRes.count ?? 0;
            const txCount = txRes.count ?? 0;

            // Only show if user has < 2 accounts AND < 5 transactions
            if (accountCount >= 2 && txCount >= 5) {
                setShouldRender(false);
                setLoading(false);
                return;
            }

            setStatus({
                accounts:     (accountsRes.count ?? 0) > 0,
                transactions: (txRes.count ?? 0) > 0,
                budgets:      (budgetsRes.count ?? 0) > 0,
                goals:        (goalsRes.count ?? 0) > 0,
                profile:      profileRes.data?.onboarding_completed === true,
            });
            setShouldRender(true);
            setLoading(false);
        }

        fetchStatus();
    }, [user, dismissed]);

    const completedCount = Object.values(status).filter(Boolean).length;
    const totalSteps = STEPS.length;
    const allDone = completedCount === totalSteps;

    // Auto-celebrate and close when all steps are done
    useEffect(() => {
        if (allDone && !loading && shouldRender) {
            setCelebrating(true);
            const timer = setTimeout(() => {
                handleDismiss();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [allDone, loading, shouldRender]);

    function handleDismiss() {
        localStorage.setItem(DISMISSED_KEY, 'true');
        setDismissed(true);
    }

    if (dismissed || loading || !shouldRender) return null;

    const progressPct = Math.round((completedCount / totalSteps) * 100);

    return (
        <div className={`onboarding-card${celebrating ? ' onboarding-celebrating' : ''}`}>
            {/* Header */}
            <div className="onboarding-header">
                <div className="onboarding-title">
                    <span className="onboarding-rocket-icon">
                        <Rocket size={18} />
                    </span>
                    <span>Primeros pasos en BC Money</span>
                </div>
                <button className="onboarding-close" onClick={handleDismiss} aria-label="Cerrar">
                    <X size={16} />
                </button>
            </div>

            {celebrating ? (
                <div className="onboarding-celebration">
                    <span className="celebration-emoji">🎉</span>
                    <p>¡Felicitaciones! Completaste todos los pasos.</p>
                    <p className="celebration-sub">Tu cuenta está lista para sacar el máximo provecho.</p>
                </div>
            ) : (
                <>
                    <p className="onboarding-subtitle">
                        Completa estos pasos para sacar el máximo provecho de la app
                    </p>

                    {/* Steps */}
                    <ul className="onboarding-steps">
                        {STEPS.map((step) => {
                            const done = status[step.key];
                            return (
                                <li key={step.key} className={`onboarding-step${done ? ' done' : ''}`}>
                                    <span className="onboarding-step-icon">
                                        {done
                                            ? <CheckCircle size={18} />
                                            : <Circle size={18} />
                                        }
                                    </span>
                                    <div className="onboarding-step-body">
                                        <span className="onboarding-step-label">{step.label}</span>
                                        <span className="onboarding-step-desc">{step.description}</span>
                                    </div>
                                    {!done && (
                                        <Link
                                            to={step.to}
                                            className="onboarding-step-link"
                                            aria-label={`Ir a ${step.label}`}
                                        >
                                            <ArrowRight size={15} />
                                        </Link>
                                    )}
                                </li>
                            );
                        })}
                    </ul>

                    {/* Progress bar */}
                    <div className="onboarding-progress">
                        <div className="onboarding-progress-bar-wrap">
                            <div
                                className="onboarding-progress-bar"
                                style={{ width: `${progressPct}%` }}
                            />
                        </div>
                        <span className="onboarding-progress-label">
                            {completedCount}/{totalSteps} completados
                        </span>
                    </div>
                </>
            )}
        </div>
    );
}
