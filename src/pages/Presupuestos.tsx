import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Plus, Edit2, Trash2, X, AlertTriangle, TrendingUp, TrendingDown,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Budget, Category, Transaction } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import {
    format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    startOfYear, endOfYear, subMonths, subWeeks, subYears,
} from 'date-fns';
import { es } from 'date-fns/locale';
import './Presupuestos.css';

type Period = 'weekly' | 'monthly' | 'yearly';

const PERIOD_LABELS: Record<Period, string> = {
    weekly: 'Semanal',
    monthly: 'Mensual',
    yearly: 'Anual',
};

function getPeriodRange(period: Period, date: Date) {
    switch (period) {
        case 'weekly': return { start: startOfWeek(date, { weekStartsOn: 1 }), end: endOfWeek(date, { weekStartsOn: 1 }) };
        case 'yearly': return { start: startOfYear(date), end: endOfYear(date) };
        default: return { start: startOfMonth(date), end: endOfMonth(date) };
    }
}

function getPrevPeriodRange(period: Period, date: Date) {
    switch (period) {
        case 'weekly': return getPeriodRange('weekly', subWeeks(date, 1));
        case 'yearly': return getPeriodRange('yearly', subYears(date, 1));
        default: return getPeriodRange('monthly', subMonths(date, 1));
    }
}

function getDaysProgress(period: Period) {
    const now = new Date();
    const { start, end } = getPeriodRange(period, now);
    const totalDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    const elapsed = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    return Math.min(elapsed / totalDays, 1);
}

export function Presupuestos() {
    const { user, profile } = useAuth();
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [currentTx, setCurrentTx] = useState<Transaction[]>([]);
    const [prevTx, setPrevTx] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<Budget | null>(null);

    const [formData, setFormData] = useState({
        category_id: '',
        amount: '',
        period: 'monthly' as Period,
    });

    const currency = profile?.currency || 'USD';

    const fetchData = useCallback(async () => {
        if (!user) return;
        const now = new Date();

        // Get ranges for all periods (we fetch a wide range and filter client-side)
        const yearStart = startOfYear(now);
        const prevYearStart = startOfYear(subYears(now, 1));

        const [budgetsRes, categoriesRes, currentTxRes, prevTxRes] = await Promise.all([
            supabase.from('budgets').select('*').eq('user_id', user.id),
            supabase.from('categories').select('*').or(`user_id.eq.${user.id},is_system.eq.true`),
            supabase.from('transactions').select('*')
                .eq('user_id', user.id).eq('type', 'expense')
                .gte('date', format(yearStart, 'yyyy-MM-dd')),
            supabase.from('transactions').select('*')
                .eq('user_id', user.id).eq('type', 'expense')
                .gte('date', format(prevYearStart, 'yyyy-MM-dd'))
                .lt('date', format(yearStart, 'yyyy-MM-dd')),
        ]);

        setBudgets(budgetsRes.data || []);
        setCategories(categoriesRes.data || []);
        setCurrentTx(currentTxRes.data || []);
        setPrevTx(prevTxRes.data || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { fetchData(); }, [fetchData]);

    function getSpent(categoryId: string | null, period: Period) {
        const { start, end } = getPeriodRange(period, new Date());
        const s = format(start, 'yyyy-MM-dd');
        const e = format(end, 'yyyy-MM-dd');
        return currentTx
            .filter(t => t.category_id === categoryId && t.date >= s && t.date <= e)
            .reduce((sum, t) => sum + Number(t.amount), 0);
    }

    function getPrevSpent(categoryId: string | null, period: Period) {
        const { start, end } = getPrevPeriodRange(period, new Date());
        const s = format(start, 'yyyy-MM-dd');
        const e = format(end, 'yyyy-MM-dd');
        const allTx = [...currentTx, ...prevTx];
        return allTx
            .filter(t => t.category_id === categoryId && t.date >= s && t.date <= e)
            .reduce((sum, t) => sum + Number(t.amount), 0);
    }

    const budgetData = useMemo(() => budgets.map(budget => {
        const category = categories.find(c => c.id === budget.category_id);
        const period = (budget.period || 'monthly') as Period;
        const spent = getSpent(budget.category_id, period);
        const prevSpent = getPrevSpent(budget.category_id, period);
        const amount = Number(budget.amount);
        const percentage = amount > 0 ? (spent / amount) * 100 : 0;
        const status = percentage <= 50 ? 'success' : percentage <= 80 ? 'info' : percentage <= 100 ? 'warning' : 'danger';
        const remaining = amount - spent;
        const trend = prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : 0;
        const timeProgress = getDaysProgress(period);
        const pacing = timeProgress > 0 ? (percentage / 100) / timeProgress : 0; // >1 = overspending

        return { ...budget, category, period, spent, prevSpent, percentage, status, remaining, trend, pacing };
    }), [budgets, categories, currentTx, prevTx]);

    // Alerts: budgets approaching or exceeding limit
    const alerts = useMemo(() => budgetData.filter(b => b.percentage >= 80), [budgetData]);

    const { totalBudget, totalSpent, totalPercentage } = useMemo(() => {
        const total = budgetData.reduce((sum, b) => sum + Number(b.amount), 0);
        const spent = budgetData.reduce((sum, b) => sum + b.spent, 0);
        return { totalBudget: total, totalSpent: spent, totalPercentage: total > 0 ? (spent / total) * 100 : 0 };
    }, [budgetData]);

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
            period: (budget.period || 'monthly') as Period,
        });
        setShowModal(true);
    };

    const handleDelete = async (budget: Budget) => {
        await supabase.from('budgets').delete().eq('id', budget.id);
        setDeleteConfirm(null);
        fetchData();
    };

    if (loading) {
        return <div className="loading-container"><div className="loading-spinner"></div></div>;
    }

    return (
        <div className="presupuestos-page animate-fadeIn">
            {/* Alerts */}
            {alerts.length > 0 && (
                <div className="budget-alerts">
                    {alerts.map(a => (
                        <div key={a.id} className={`budget-alert alert-${a.status}`}>
                            <AlertTriangle size={18} />
                            <span>
                                <strong>{a.category?.name || 'General'}</strong>
                                {a.percentage >= 100
                                    ? ` — Excedido: ${currency} ${Math.abs(a.remaining).toLocaleString()} sobre el límite`
                                    : ` — ${a.percentage.toFixed(0)}% usado, quedan ${currency} ${a.remaining.toLocaleString()}`}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Total Budget Overview */}
            <div className="budget-overview">
                <div className="overview-header">
                    <h2>Presupuesto Total</h2>
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
                <h3>Presupuestos por Categoría ({budgetData.length})</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={async () => {
                    if (!user || budgets.length > 0) return;
                    const expCats = categories.filter(c => c.type === 'expense' || c.type === 'both').slice(0, 6);
                    for (const cat of expCats) {
                        await supabase.from('budgets').insert({ user_id: user.id, category_id: cat.id, amount: 500000, period: 'monthly' });
                    }
                    fetchData();
                }} disabled={budgets.length > 0} title={budgets.length > 0 ? 'Ya tienes presupuestos' : 'Crear presupuestos para las primeras 6 categorías de gasto'}>
                    Plantilla Rápida
                </button>
                <button className="btn btn-primary" onClick={() => {
                    setEditingBudget(null);
                    setFormData({ category_id: '', amount: '', period: 'monthly' });
                    setShowModal(true);
                }}>
                    <Plus size={18} />
                    Nuevo Presupuesto
                </button>
                </div>
            </div>

            {/* Budget Cards */}
            <div className="budgets-grid">
                {budgetData.length > 0 ? (
                    budgetData.map(budget => (
                        <div key={budget.id} className={`budget-card status-${budget.status}`}>
                            <div className="budget-header">
                                <div className="budget-category">
                                    <span className="category-dot" style={{ backgroundColor: budget.category?.color || '#6B7280' }}></span>
                                    <span>{budget.category?.name || 'General'}</span>
                                </div>
                                <span className="period-badge">{PERIOD_LABELS[budget.period]}</span>
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
                                {/* Time marker */}
                                <div className="time-marker" style={{ left: `${getDaysProgress(budget.period) * 100}%` }} title="Progreso del periodo"></div>
                            </div>

                            <div className="budget-footer">
                                <span className={`remaining ${budget.remaining >= 0 ? 'positive' : 'negative'}`}>
                                    {budget.remaining >= 0
                                        ? `${currency} ${budget.remaining.toLocaleString()} disponible`
                                        : `${currency} ${Math.abs(budget.remaining).toLocaleString()} excedido`}
                                </span>
                                <span className="percentage">{budget.percentage.toFixed(0)}%</span>
                            </div>

                            {/* Trend + Pacing */}
                            <div className="budget-insights">
                                {budget.prevSpent > 0 && (
                                    <span className={`trend ${budget.trend <= 0 ? 'positive' : 'negative'}`}>
                                        {budget.trend <= 0 ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                                        {Math.abs(budget.trend).toFixed(0)}% vs periodo anterior
                                    </span>
                                )}
                                {budget.pacing > 1.1 && (
                                    <span className="pacing-warn">
                                        <AlertTriangle size={13} /> Ritmo alto de gasto
                                    </span>
                                )}
                            </div>

                            <div className="budget-card-actions">
                                <button type="button" className="btn btn-icon btn-ghost" title="Editar" onClick={() => handleEdit(budget)}>
                                    <Edit2 size={14} />
                                </button>
                                <button type="button" className="btn btn-icon btn-ghost" title="Eliminar" onClick={() => setDeleteConfirm(budget)}>
                                    <Trash2 size={14} />
                                </button>
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

            {/* Modal Crear/Editar */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingBudget ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}</h2>
                            <button type="button" className="btn btn-icon btn-ghost" title="Cerrar" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Categoría</label>
                                <select
                                    className="form-select"
                                    value={formData.category_id}
                                    onChange={e => setFormData(p => ({ ...p, category_id: e.target.value }))}
                                    required
                                    title="Categoría"
                                >
                                    <option value="">Seleccionar categoría</option>
                                    {categories
                                        .filter(c => c.type === 'expense' || c.type === 'both')
                                        .map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Monto ({currency})</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.amount}
                                    onChange={e => setFormData(p => ({ ...p, amount: e.target.value }))}
                                    placeholder="0.00"
                                    min="0"
                                    step="0.01"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Periodo</label>
                                <select
                                    className="form-select"
                                    value={formData.period}
                                    onChange={e => setFormData(p => ({ ...p, period: e.target.value as Period }))}
                                    title="Periodo"
                                >
                                    <option value="weekly">Semanal</option>
                                    <option value="monthly">Mensual</option>
                                    <option value="yearly">Anual</option>
                                </select>
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

            {/* Modal Eliminar */}
            {deleteConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="modal delete-modal" onClick={e => e.stopPropagation()}>
                        <AlertTriangle size={40} color="#F59E0B" />
                        <h2>¿Eliminar presupuesto de "{categories.find(c => c.id === deleteConfirm.category_id)?.name || 'General'}"?</h2>
                        <p>Esta acción no se puede deshacer.</p>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                            <button type="button" className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}>Eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
