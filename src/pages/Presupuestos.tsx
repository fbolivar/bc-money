import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Budget, Category, Transaction } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import './Presupuestos.css';

export function Presupuestos() {
    const { user, profile } = useAuth();
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingBudget, setEditingBudget] = useState<Budget | null>(null);

    const [formData, setFormData] = useState({
        category_id: '',
        amount: '',
        period: 'monthly' as 'weekly' | 'monthly' | 'yearly',
    });

    const currency = profile?.currency || 'USD';

    useEffect(() => {
        if (user) fetchData();
    }, [user]);

    const fetchData = async () => {
        const now = new Date();
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);

        const [budgetsRes, categoriesRes, transactionsRes] = await Promise.all([
            supabase.from('budgets').select('*').eq('user_id', user!.id),
            supabase.from('categories').select('*').or(`user_id.eq.${user!.id},is_system.eq.true`),
            supabase
                .from('transactions')
                .select('*')
                .eq('user_id', user!.id)
                .eq('type', 'expense')
                .gte('date', format(monthStart, 'yyyy-MM-dd'))
                .lte('date', format(monthEnd, 'yyyy-MM-dd')),
        ]);

        setBudgets(budgetsRes.data || []);
        setCategories(categoriesRes.data || []);
        setTransactions(transactionsRes.data || []);
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const data = {
            user_id: user!.id,
            category_id: formData.category_id || null,
            amount: parseFloat(formData.amount),
            period: formData.period,
        };

        if (editingBudget) {
            await supabase.from('budgets').update(data).eq('id', editingBudget.id);
        } else {
            await supabase.from('budgets').insert(data);
        }

        setShowModal(false);
        setEditingBudget(null);
        setFormData({ category_id: '', amount: '', period: 'monthly' });
        fetchData();
    };

    const handleEdit = (budget: Budget) => {
        setEditingBudget(budget);
        setFormData({
            category_id: budget.category_id || '',
            amount: budget.amount.toString(),
            period: budget.period,
        });
        setShowModal(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm('¿Eliminar este presupuesto?')) {
            await supabase.from('budgets').delete().eq('id', id);
            fetchData();
        }
    };

    const getBudgetData = () => {
        return budgets.map((budget) => {
            const category = categories.find((c) => c.id === budget.category_id);
            const spent = transactions
                .filter((t) => t.category_id === budget.category_id)
                .reduce((sum, t) => sum + Number(t.amount), 0);
            const percentage = (spent / Number(budget.amount)) * 100;
            const status = percentage <= 80 ? 'success' : percentage <= 100 ? 'warning' : 'danger';
            const remaining = Number(budget.amount) - spent;

            return {
                ...budget,
                category,
                spent,
                percentage,
                status,
                remaining,
            };
        });
    };

    const budgetData = getBudgetData();
    const totalBudget = budgets.reduce((sum, b) => sum + Number(b.amount), 0);
    const totalSpent = budgetData.reduce((sum, b) => sum + b.spent, 0);
    const totalPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    if (loading) {
        return <div className="loading-container"><div className="loading-spinner"></div></div>;
    }

    return (
        <div className="presupuestos-page animate-fadeIn">
            {/* Total Budget Overview */}
            <div className="budget-overview">
                <div className="overview-header">
                    <h2>Presupuesto Total Mensual</h2>
                    <span className={`overview-status status-${totalPercentage <= 80 ? 'success' : totalPercentage <= 100 ? 'warning' : 'danger'}`}>
                        {totalPercentage.toFixed(0)}% usado
                    </span>
                </div>
                <div className="overview-amounts">
                    <span className="spent">{currency} {totalSpent.toLocaleString()} gastado</span>
                    <span className="total">de {currency} {totalBudget.toLocaleString()}</span>
                </div>
                <div className="progress large">
                    <div
                        className={`progress-bar progress-${totalPercentage <= 80 ? 'success' : totalPercentage <= 100 ? 'warning' : 'danger'}`}
                        style={{ width: `${Math.min(totalPercentage, 100)}%` }}
                    ></div>
                </div>
            </div>

            {/* Actions */}
            <div className="toolbar">
                <h3>Presupuestos por Categoría</h3>
                <button className="btn btn-primary" onClick={() => { setEditingBudget(null); setFormData({ category_id: '', amount: '', period: 'monthly' }); setShowModal(true); }}>
                    <Plus size={18} />
                    Nuevo Presupuesto
                </button>
            </div>

            {/* Budget Cards */}
            <div className="budgets-grid">
                {budgetData.length > 0 ? (
                    budgetData.map((budget) => (
                        <div key={budget.id} className={`budget-card status-${budget.status}`}>
                            <div className="budget-header">
                                <div className="budget-category">
                                    <span
                                        className="category-dot"
                                        style={{ backgroundColor: budget.category?.color || '#6B7280' }}
                                    ></span>
                                    <span>{budget.category?.name || 'General'}</span>
                                </div>
                                <div className="budget-actions">
                                    <button className="btn btn-icon btn-ghost" onClick={() => handleEdit(budget)}>
                                        <Edit2 size={14} />
                                    </button>
                                    <button className="btn btn-icon btn-ghost" onClick={() => handleDelete(budget.id)}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className="budget-amounts">
                                <span className="amount-spent">{currency} {budget.spent.toLocaleString()}</span>
                                <span className="amount-total">/ {currency} {Number(budget.amount).toLocaleString()}</span>
                            </div>

                            <div className="progress">
                                <div
                                    className={`progress-bar progress-${budget.status}`}
                                    style={{ width: `${Math.min(budget.percentage, 100)}%` }}
                                ></div>
                            </div>

                            <div className="budget-footer">
                                <span className={`remaining ${budget.remaining >= 0 ? 'positive' : 'negative'}`}>
                                    {budget.remaining >= 0
                                        ? `${currency} ${budget.remaining.toLocaleString()} disponible`
                                        : `${currency} ${Math.abs(budget.remaining).toLocaleString()} excedido`}
                                </span>
                                <span className="percentage">{budget.percentage.toFixed(0)}%</span>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="empty-state">
                        <p>No tienes presupuestos configurados.</p>
                        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                            Crear primer presupuesto
                        </button>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingBudget ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}</h2>
                            <button className="btn btn-icon btn-ghost" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Categoría</label>
                                <select
                                    className="form-select"
                                    value={formData.category_id}
                                    onChange={(e) => setFormData((p) => ({ ...p, category_id: e.target.value }))}
                                    required
                                >
                                    <option value="">Seleccionar categoría</option>
                                    {categories
                                        .filter((c) => c.type === 'expense' || c.type === 'both')
                                        .map((cat) => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Monto ({currency})</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.amount}
                                    onChange={(e) => setFormData((p) => ({ ...p, amount: e.target.value }))}
                                    placeholder="0.00"
                                    min="0"
                                    step="0.01"
                                    required
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingBudget ? 'Guardar' : 'Crear Presupuesto'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
