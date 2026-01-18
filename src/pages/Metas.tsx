import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Target, Shield, GraduationCap, ShoppingBag, TrendingUp, Coins } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Goal } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { format, differenceInDays, differenceInMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import './Metas.css';

const GOAL_TYPES = [
    { value: 'emergency_fund', label: 'Fondo de Emergencia', icon: Shield, color: '#10B981' },
    { value: 'savings', label: 'Ahorro General', icon: Coins, color: '#3B82F6' },
    { value: 'purchase', label: 'Compra', icon: ShoppingBag, color: '#F59E0B' },
    { value: 'education', label: 'Educación', icon: GraduationCap, color: '#8B5CF6' },
    { value: 'investment', label: 'Inversión', icon: TrendingUp, color: '#EC4899' },
    { value: 'other', label: 'Otro', icon: Target, color: '#6B7280' },
];

type SavingsPlan =
    | { type: 'error'; message: string }
    | { type: 'completed' }
    | { type: 'plan'; days: number; months: number; monthly: number; weekly: number; remaining: number };

export function Metas() {
    const { user, profile } = useAuth();
    // ... (state hooks remain same)
    const [goals, setGoals] = useState<Goal[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showContributeModal, setShowContributeModal] = useState(false);
    const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
    const [contributionAmount, setContributionAmount] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        target_amount: '',
        target_percentage: '',
        target_mode: 'amount' as 'amount' | 'percentage',
        target_date: '',
        goal_type: 'savings',
        priority: 1,
    });

    const currency = profile?.currency || 'USD';

    const getGoals = async (userId: string) => {
        const { data } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', userId)
            .order('priority', { ascending: true });
        return data || [];
    };

    const monthlyNetIncome = profile ? (
        profile.income_type === 'hourly'
            ? (profile.hourly_rate || 0) * (profile.hours_per_week || 0) * 4.33
            : (profile.fixed_salary || 0)
    ) * ((profile.net_income_percentage || 100) / 100) : 0;

    const refreshGoals = async () => {
        if (!user) return;
        const data = await getGoals(user.id);
        setGoals(data);
        setLoading(false);
    };

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }
        getGoals(user.id).then(data => {
            setGoals(data);
            setLoading(false);
        });
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const goalType = GOAL_TYPES.find(t => t.value === formData.goal_type);

        let finalAmount = parseFloat(formData.target_amount);
        if (formData.target_mode === 'percentage') {
            const monthlyAmount = monthlyNetIncome * (parseFloat(formData.target_percentage) / 100);
            let multiplier = 1;

            if (formData.target_date) {
                const months = Math.max(differenceInMonths(new Date(formData.target_date), new Date()), 1);
                multiplier = months;
            }
            finalAmount = monthlyAmount * multiplier;
        }

        const data = {
            user_id: user!.id,
            name: formData.name,
            description: formData.description || null,
            target_amount: finalAmount,
            target_mode: formData.target_mode,
            target_percentage: formData.target_mode === 'percentage' ? parseFloat(formData.target_percentage) : null,
            target_date: formData.target_date || null,
            goal_type: formData.goal_type,
            priority: formData.priority,
            icon: goalType?.icon.name || 'target',
            color: goalType?.color || '#6B7280',
        };

        // Logic to update status if target amount increases
        let statusUpdate = {};
        if (selectedGoal && finalAmount > Number(selectedGoal.current_amount)) {
            statusUpdate = { status: 'active', completed_at: null };
        }

        if (selectedGoal) {
            await supabase.from('goals').update({ ...data, ...statusUpdate }).eq('id', selectedGoal.id);
        } else {
            await supabase.from('goals').insert(data);
        }

        closeModal();
        refreshGoals();
    };

    const calculateSavingsPlan = (target: number, current: number, dateStr: string | null): SavingsPlan | null => {
        if (!dateStr || !target) return null;
        const targetDate = new Date(dateStr);
        const today = new Date();
        const days = differenceInDays(targetDate, today);
        const months = days / 30;

        if (days <= 0) return { type: 'error', message: 'La fecha debe ser futura' };

        const remaining = Math.max(0, target - current);
        if (remaining <= 0) return { type: 'completed' };

        const monthly = remaining / Math.max(months, 0.5); // Avoid division by zero, min half month
        const weekly = remaining / (days / 7);

        return { type: 'plan', days, months, monthly, weekly, remaining };
    };

    const handleContribute = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedGoal) return;

        const amount = parseFloat(contributionAmount);
        const newAmount = Number(selectedGoal.current_amount) + amount;

        await supabase
            .from('goals')
            .update({
                current_amount: newAmount,
                status: newAmount >= Number(selectedGoal.target_amount) ? 'completed' : 'active',
                completed_at: newAmount >= Number(selectedGoal.target_amount) ? new Date().toISOString() : null,
            })
            .eq('id', selectedGoal.id);

        await supabase.from('goal_contributions').insert({
            goal_id: selectedGoal.id,
            amount,
            date: format(new Date(), 'yyyy-MM-dd'),
        });

        setShowContributeModal(false);
        setContributionAmount('');
        setSelectedGoal(null);
        refreshGoals();
    };

    const handleDelete = async (id: string) => {
        if (confirm('¿Eliminar esta meta?')) {
            await supabase.from('goals').delete().eq('id', id);
            refreshGoals();
        }
    };

    const closeModal = () => {
        setShowModal(false);
        setSelectedGoal(null);
        setSelectedGoal(null);
        setFormData({
            name: '',
            description: '',
            target_amount: '',
            target_percentage: '',
            target_mode: 'amount',
            target_date: '',
            goal_type: 'savings',
            priority: 1
        });
    };

    const openEdit = (goal: Goal) => {
        setSelectedGoal(goal);
        setFormData({
            name: goal.name,
            description: goal.description || '',
            target_amount: goal.target_amount.toString(),
            target_percentage: goal.target_percentage?.toString() || '',
            target_mode: (goal.target_mode as 'amount' | 'percentage') || 'amount',
            target_date: goal.target_date || '',
            goal_type: goal.goal_type,
            priority: goal.priority,
        });
        setShowModal(true);
    };

    const activeGoals = goals.filter(g => g.status === 'active');
    const completedGoals = goals.filter(g => g.status === 'completed');

    if (loading) {
        return <div className="loading-container"><div className="loading-spinner"></div></div>;
    }

    return (
        <div className="metas-page animate-fadeIn">
            <div className="toolbar">
                <div>
                    <h2>Tus Metas Financieras</h2>
                    <p className="text-secondary">Define y alcanza tus objetivos paso a paso</p>
                </div>
                <button className="btn btn-primary" onClick={() => { setSelectedGoal(null); setShowModal(true); }}>
                    <Plus size={18} />
                    Nueva Meta
                </button>
            </div>

            {/* Active Goals */}
            <section className="goals-section">
                <h3>Metas Activas ({activeGoals.length})</h3>
                <div className="goals-grid">
                    {activeGoals.length > 0 ? (
                        activeGoals.map((goal) => {
                            const progress = (Number(goal.current_amount) / Number(goal.target_amount)) * 100;
                            const GoalIcon = GOAL_TYPES.find(t => t.value === goal.goal_type)?.icon || Target;

                            return (
                                <div key={goal.id} className="goal-card">
                                    <div className="goal-header">
                                        <div className="goal-icon" style={{ backgroundColor: goal.color }}>
                                            <GoalIcon size={24} color="white" />
                                        </div>
                                        <div className="goal-actions">
                                            <button className="btn btn-icon btn-ghost" onClick={() => openEdit(goal)}>
                                                <Edit2 size={14} />
                                            </button>
                                            <button className="btn btn-icon btn-ghost" onClick={() => handleDelete(goal.id)}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <h4 className="goal-name">{goal.name}</h4>
                                    {goal.description && <p className="goal-description">{goal.description}</p>}

                                    <div className="goal-progress-section">
                                        <div className="goal-amounts">
                                            <span className="current">{currency} {Number(goal.current_amount).toLocaleString()}</span>
                                            <span className="target">/ {currency} {Number(goal.target_amount).toLocaleString()}</span>
                                        </div>
                                        <div className="progress">
                                            <div className="progress-bar progress-success" style={{ width: `${Math.min(progress, 100)}%` }}></div>
                                        </div>
                                        <span className="percentage">{progress.toFixed(0)}% completado</span>
                                    </div>

                                    {goal.target_date && (
                                        <div className="goal-footer-info">
                                            <p className="goal-date">
                                                Meta: {format(new Date(goal.target_date), 'd MMM yyyy', { locale: es })}
                                            </p>
                                            {(() => {
                                                const plan = calculateSavingsPlan(Number(goal.target_amount), Number(goal.current_amount), goal.target_date);
                                                if (plan && plan.type === 'plan') {
                                                    return (
                                                        <p className="goal-plan text-xs text-primary font-medium">
                                                            Ahorra {currency} {plan.monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mes
                                                        </p>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
                                    )}

                                    <button
                                        className="btn btn-primary w-full"
                                        onClick={() => { setSelectedGoal(goal); setShowContributeModal(true); }}
                                    >
                                        Aportar
                                    </button>
                                </div>
                            );
                        })
                    ) : (
                        <div className="empty-state">
                            <p>No tienes metas activas. ¡Crea tu primera meta!</p>
                        </div>
                    )}
                </div>
            </section>

            {/* Completed Goals */}
            {completedGoals.length > 0 && (
                <section className="goals-section">
                    <h3>Metas Completadas ({completedGoals.length}) 🎉</h3>
                    <div className="goals-grid">
                        {completedGoals.map((goal) => (
                            <div key={goal.id} className="goal-card completed">
                                <div className="goal-header">
                                    <div className="goal-icon" style={{ backgroundColor: goal.color }}>
                                        <Target size={24} color="white" />
                                    </div>
                                    <div className="goal-actions">
                                        <button className="btn btn-icon btn-ghost" onClick={() => openEdit(goal)}>
                                            <Edit2 size={14} />
                                        </button>
                                        <button className="btn btn-icon btn-ghost" onClick={() => handleDelete(goal.id)}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                                <h4 className="goal-name">{goal.name}</h4>
                                <p className="goal-completed-text">
                                    ¡Meta alcanzada! {currency} {Number(goal.target_amount).toLocaleString()}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* New/Edit Goal Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{selectedGoal ? 'Editar Meta' : 'Nueva Meta'}</h2>
                            <button className="btn btn-icon btn-ghost" onClick={closeModal}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Tipo de meta</label>
                                <div className="goal-type-grid">
                                    {GOAL_TYPES.map((type) => (
                                        <button
                                            key={type.value}
                                            type="button"
                                            className={`goal-type-btn ${formData.goal_type === type.value ? 'selected' : ''}`}
                                            onClick={() => setFormData(p => ({ ...p, goal_type: type.value }))}
                                            style={{ '--accent-color': type.color } as React.CSSProperties}
                                        >
                                            <type.icon size={20} />
                                            <span>{type.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Nombre de la meta</label>
                                <input
                                    type="text"
                                    name="name"
                                    id="name"
                                    className="form-input"
                                    value={formData.name}
                                    onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                                    placeholder="Ej: Fondo de emergencia 3 meses"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Definir objetivo por</label>
                                <div className="mode-toggle">
                                    <button
                                        type="button"
                                        className={`toggle-btn ${formData.target_mode === 'amount' ? 'active' : ''}`}
                                        onClick={() => setFormData(p => ({ ...p, target_mode: 'amount' }))}
                                    >
                                        Monto Fijo
                                    </button>
                                    <button
                                        type="button"
                                        className={`toggle-btn ${formData.target_mode === 'percentage' ? 'active' : ''}`}
                                        onClick={() => setFormData(p => ({ ...p, target_mode: 'percentage' }))}
                                    >
                                        % Ingreso Neto
                                    </button>
                                </div>
                            </div>

                            {formData.target_mode === 'amount' ? (
                                <div className="form-group">
                                    <label className="form-label">Monto objetivo ({currency})</label>
                                    <input
                                        type="number"
                                        name="target_amount"
                                        id="target_amount"
                                        className="form-input"
                                        value={formData.target_amount}
                                        onChange={(e) => setFormData(p => ({ ...p, target_amount: e.target.value }))}
                                        placeholder="0.00"
                                        min="0"
                                        step="0.01"
                                        required={formData.target_mode === 'amount'}
                                    />
                                </div>
                            ) : (
                                <div className="form-group">
                                    <label className="form-label">Porcentaje de Ingreso Neto ({currency} {monthlyNetIncome.toLocaleString()})</label>
                                    <div className="flex gap-2 items-center">
                                        <input
                                            type="number"
                                            name="target_percentage"
                                            id="target_percentage"
                                            className="form-input"
                                            value={formData.target_percentage}
                                            onChange={(e) => setFormData(p => ({ ...p, target_percentage: e.target.value }))}
                                            placeholder="Ej: 10"
                                            min="0"
                                            max="1000"
                                            step="0.1"
                                            required={formData.target_mode === 'percentage'}
                                        />
                                        <span className="text-lg font-bold">%</span>
                                    </div>
                                    {formData.target_percentage && (
                                        <div className="helper-text mt-sm">
                                            <p className="text-sm">Ahorro mensual: <strong className="text-primary">{currency} {(monthlyNetIncome * (parseFloat(formData.target_percentage) || 0) / 100).toLocaleString()}</strong></p>

                                            {formData.target_date && (
                                                <div className="mt-2 p-2 bg-surface-hover rounded border border-border">
                                                    <p className="text-xs text-secondary mb-1">
                                                        Proyección ({Math.max(differenceInMonths(new Date(formData.target_date), new Date()), 1)} meses):
                                                    </p>
                                                    <p className="text-lg font-bold text-success">
                                                        Total: {currency} {(monthlyNetIncome * (parseFloat(formData.target_percentage) || 0) / 100 * Math.max(differenceInMonths(new Date(formData.target_date), new Date()), 1)).toLocaleString()}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Fecha objetivo (opcional)</label>
                                <input
                                    type="date"
                                    name="target_date"
                                    id="target_date"
                                    className="form-input"
                                    value={formData.target_date}
                                    onChange={(e) => setFormData(p => ({ ...p, target_date: e.target.value }))}
                                />
                                {formData.target_date && formData.target_amount && (
                                    <div className="savings-plan-preview mt-sm p-3 bg-surface-hover rounded-md border border-border">
                                        {(() => {
                                            const amount = parseFloat(formData.target_amount);
                                            const current = selectedGoal ? Number(selectedGoal.current_amount) : 0;
                                            const plan = calculateSavingsPlan(amount, current, formData.target_date);

                                            if (plan?.type === 'error') return <span className="text-danger text-sm">{plan.message}</span>;
                                            if (plan?.type === 'completed') return <span className="text-success text-sm">¡Meta alcanzada!</span>;
                                            if (plan?.type === 'plan') {
                                                return (
                                                    <div className="text-sm">
                                                        <p className="font-medium mb-1">Para lograrlo a tiempo necesitas ahorrar:</p>
                                                        <div className="flex gap-4">
                                                            <div>
                                                                <span className="block text-xl font-bold text-primary">{currency} {plan.monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                                <span className="text-secondary text-xs">al mes</span>
                                                            </div>
                                                            <div className="border-l border-border pl-4">
                                                                <span className="block text-xl font-bold text-primary">{currency} {plan.weekly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                                <span className="text-secondary text-xs">semanal</span>
                                                            </div>
                                                        </div>
                                                        <p className="text-xs text-secondary mt-2">
                                                            Faltan {Math.ceil(plan.months)} meses ({plan.days} días)
                                                        </p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                )}
                            </div>

                            <div className="form-group">
                                <label className="form-label">Descripción (opcional)</label>
                                <textarea
                                    name="description"
                                    id="description"
                                    className="form-textarea"
                                    value={formData.description}
                                    onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                                    placeholder="¿Por qué es importante esta meta para ti?"
                                    rows={2}
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">{selectedGoal ? 'Guardar' : 'Crear Meta'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Contribute Modal */}
            {showContributeModal && selectedGoal && (
                <div className="modal-overlay" onClick={() => setShowContributeModal(false)}>
                    <div className="modal small" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Aportar a "{selectedGoal.name}"</h2>
                            <button className="btn btn-icon btn-ghost" onClick={() => setShowContributeModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleContribute} className="modal-body">
                            <div className="contribute-info">
                                <p>Progreso actual: {currency} {Number(selectedGoal.current_amount).toLocaleString()} / {currency} {Number(selectedGoal.target_amount).toLocaleString()}</p>
                                <p>Faltan: {currency} {(Number(selectedGoal.target_amount) - Number(selectedGoal.current_amount)).toLocaleString()}</p>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Monto a aportar ({currency})</label>
                                <input
                                    type="number"
                                    name="contributionAmount"
                                    id="contributionAmount"
                                    className="form-input amount-input"
                                    value={contributionAmount}
                                    onChange={(e) => setContributionAmount(e.target.value)}
                                    placeholder="0.00"
                                    min="0"
                                    step="0.01"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowContributeModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Aportar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
