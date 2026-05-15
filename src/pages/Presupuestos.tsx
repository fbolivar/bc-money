import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Plus, Edit2, Trash2, X, AlertTriangle, TrendingUp, TrendingDown,
    ChevronLeft, ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Budget, Category, Transaction } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import {
    format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    startOfYear, endOfYear, subMonths, subWeeks, subYears, addMonths,
    isBefore, isAfter,
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

function getDaysProgress(period: Period, refDate: Date) {
    const now = new Date();
    const { start, end } = getPeriodRange(period, refDate);
    if (isBefore(now, start)) return 0;
    if (isAfter(now, end)) return 1;
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
    const [saving, setSaving] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<Budget | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()));

    const [formData, setFormData] = useState({
        category_id: '',
        amount: '',
        period: 'monthly' as Period,
    });

    const currency = profile?.currency || 'USD';
    const currentMonthStart = startOfMonth(new Date());
    const isFutureMonth = isAfter(selectedMonth, currentMonthStart);
    const isPastMonth = isBefore(selectedMonth, currentMonthStart);
    const isCurrentMonth = !isFutureMonth && !isPastMonth;

    const showToast = useCallback((msg: string, type: 'success' | 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    }, []);

    const fetchData = useCallback(async () => {
        if (!user) return;
        try {
            const selectedYear = selectedMonth.getFullYear();
            const yearStart = startOfYear(new Date(selectedYear, 0, 1));
            const yearEnd = endOfYear(new Date(selectedYear, 0, 1));
            const prevYearStart = startOfYear(new Date(selectedYear - 1, 0, 1));

            const [budgetsRes, categoriesRes, currentTxRes, prevTxRes] = await Promise.all([
                supabase.from('budgets').select('*').eq('user_id', user.id),
                supabase.from('categories').select('*').or(`user_id.eq.${user.id},is_system.eq.true`),
                supabase.from('transactions').select('*')
                    .eq('user_id', user.id).eq('type', 'expense')
                    .gte('date', format(yearStart, 'yyyy-MM-dd'))
                    .lte('date', format(yearEnd, 'yyyy-MM-dd')),
                supabase.from('transactions').select('*')
                    .eq('user_id', user.id).eq('type', 'expense')
                    .gte('date', format(prevYearStart, 'yyyy-MM-dd'))
                    .lt('date', format(yearStart, 'yyyy-MM-dd')),
            ]);

            if (budgetsRes.error) throw budgetsRes.error;
            if (categoriesRes.error) throw categoriesRes.error;

            setBudgets(budgetsRes.data || []);
            setCategories(categoriesRes.data || []);
            setCurrentTx(currentTxRes.data || []);
            setPrevTx(prevTxRes.data || []);
        } catch {
            showToast('Error al cargar los datos. Intenta de nuevo.', 'error');
        } finally {
            setLoading(false);
        }
    }, [user, selectedMonth, showToast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const budgetData = useMemo(() => {
        function getSpent(categoryId: string | null, period: Period) {
            if (isFutureMonth) return 0;
            const { start, end } = getPeriodRange(period, selectedMonth);
            const s = format(start, 'yyyy-MM-dd');
            const e = format(end, 'yyyy-MM-dd');
            return currentTx
                .filter(t => t.category_id === categoryId && t.date >= s && t.date <= e)
                .reduce((sum, t) => sum + Number(t.amount), 0);
        }

        function getPrevSpent(categoryId: string | null, period: Period) {
            const { start, end } = getPrevPeriodRange(period, selectedMonth);
            const s = format(start, 'yyyy-MM-dd');
            const e = format(end, 'yyyy-MM-dd');
            return [...currentTx, ...prevTx]
                .filter(t => t.category_id === categoryId && t.date >= s && t.date <= e)
                .reduce((sum, t) => sum + Number(t.amount), 0);
        }

        return budgets.map(budget => {
            const category = categories.find(c => c.id === budget.category_id);
            const period = (budget.period || 'monthly') as Period;
            const spent = getSpent(budget.category_id, period);
            const prevSpent = getPrevSpent(budget.category_id, period);
            const amount = Number(budget.amount);
            const percentage = amount > 0 ? (spent / amount) * 100 : 0;
            const status = isFutureMonth ? 'planned'
                : percentage <= 50 ? 'success'
                : percentage <= 80 ? 'info'
                : percentage <= 100 ? 'warning'
                : 'danger';
            const remaining = amount - spent;
            const trend = prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : 0;
            const timeProgress = getDaysProgress(period, selectedMonth);
            const pacing = (!isFutureMonth && timeProgress > 0) ? (percentage / 100) / timeProgress : 0;

            return { ...budget, category, period, spent, prevSpent, percentage, status, remaining, trend, pacing };
        });
    }, [budgets, categories, currentTx, prevTx, selectedMonth, isFutureMonth]);

    const alerts = useMemo(() => budgetData.filter(b => b.percentage >= 80 && !isFutureMonth), [budgetData, isFutureMonth]);

    const { totalBudget, totalSpent, totalPercentage } = useMemo(() => {
        const total = budgetData.reduce((sum, b) => sum + Number(b.amount), 0);
        const spent = budgetData.reduce((sum, b) => sum + b.spent, 0);
        return { totalBudget: total, totalSpent: spent, totalPercentage: total > 0 ? (spent / total) * 100 : 0 };
    }, [budgetData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const data = {
                user_id: user!.id,
                category_id: formData.category_id || null,
                amount: parseFloat(formData.amount),
                period: formData.period,
                start_date: format(new Date(), 'yyyy-MM-dd'),
            };

            const res = editingBudget
                ? await supabase.from('budgets').update(data).eq('id', editingBudget.id)
                : await supabase.from('budgets').insert(data);

            if (res.error) throw res.error;

            setShowModal(false);
            setEditingBudget(null);
            setFormData({ category_id: '', amount: '', period: 'monthly' });
            showToast(editingBudget ? 'Presupuesto actualizado.' : 'Presupuesto creado.', 'success');
            await fetchData();
        } catch {
            showToast('Error al guardar el presupuesto. Intenta de nuevo.', 'error');
        } finally {
            setSaving(false);
        }
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
        try {
            const res = await supabase.from('budgets').delete().eq('id', budget.id);
            if (res.error) throw res.error;
            setDeleteConfirm(null);
            showToast('Presupuesto eliminado.', 'success');
            await fetchData();
        } catch {
            showToast('Error al eliminar el presupuesto. Intenta de nuevo.', 'error');
        }
    };

    const handleQuickTemplate = async () => {
        if (!user || budgets.length > 0) return;
        try {
            const expCats = categories.filter(c => c.type === 'expense' || c.type === 'both').slice(0, 6);
            const today = format(new Date(), 'yyyy-MM-dd');
            const inserts = expCats.map(cat => ({
                user_id: user.id,
                category_id: cat.id,
                amount: 500000,
                period: 'monthly' as Period,
                start_date: today,
            }));
            const res = await supabase.from('budgets').insert(inserts);
            if (res.error) throw res.error;
            showToast('Plantilla creada con 6 presupuestos.', 'success');
            await fetchData();
        } catch {
            showToast('Error al crear la plantilla. Intenta de nuevo.', 'error');
        }
    };

    if (loading) {
        return <div className="loading-container"><div className="loading-spinner"></div></div>;
    }

    const totalProgressStatus = isFutureMonth ? 'planned'
        : totalPercentage <= 80 ? 'success'
        : totalPercentage <= 100 ? 'warning'
        : 'danger';

    const monthLabel = format(selectedMonth, 'MMMM yyyy', { locale: es });
    const monthLabelCapitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

    return (
        <div className="presupuestos-page animate-fadeIn">
            {/* Toast */}
            {toast && (
                <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
            )}

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
            <div className={`budget-overview${isFutureMonth ? ' overview-planned' : ''}`}>
                {isFutureMonth && (
                    <div className="overview-mode-badge">Planeación</div>
                )}
                <div className="overview-header">
                    <h2>{isFutureMonth ? 'Necesitarás' : isPastMonth ? 'Presupuesto Total' : 'Presupuesto Total'}</h2>
                    <span className={`overview-status status-${totalProgressStatus}`}>
                        {isFutureMonth
                            ? `${currency} ${totalBudget.toLocaleString()}`
                            : `${totalPercentage.toFixed(0)}% usado`}
                    </span>
                </div>
                <div className="overview-amounts">
                    {isFutureMonth ? (
                        <span className="spent">{budgetData.length} categorías presupuestadas</span>
                    ) : (
                        <>
                            <span className="spent">{currency} {totalSpent.toLocaleString()} gastado</span>
                            <span className="total">de {currency} {totalBudget.toLocaleString()}</span>
                        </>
                    )}
                </div>
                {!isFutureMonth && (
                    <div className="progress large">
                        <div
                            className={`progress-bar progress-${totalProgressStatus}`}
                            style={{ '--bar-width': `${Math.min(totalPercentage, 100)}%` } as React.CSSProperties}
                        ></div>
                    </div>
                )}
            </div>

            {/* Toolbar */}
            <div className="toolbar">
                {/* Month navigator */}
                <div className="month-navigator">
                    <button
                        type="button"
                        className="btn btn-icon btn-ghost"
                        onClick={() => setSelectedMonth(m => subMonths(m, 1))}
                        title="Mes anterior"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <span className={`month-label${isCurrentMonth ? ' month-current' : isFutureMonth ? ' month-future' : ' month-past'}`}>
                        {monthLabelCapitalized}
                        {isFutureMonth && <span className="month-tag">Planeación</span>}
                        {isPastMonth && <span className="month-tag month-tag-past">Histórico</span>}
                    </span>
                    <button
                        type="button"
                        className="btn btn-icon btn-ghost"
                        onClick={() => setSelectedMonth(m => addMonths(m, 1))}
                        title="Mes siguiente"
                    >
                        <ChevronRight size={18} />
                    </button>
                    {!isCurrentMonth && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setSelectedMonth(startOfMonth(new Date()))}
                        >
                            Hoy
                        </button>
                    )}
                </div>

                <div className="toolbar-actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleQuickTemplate}
                        disabled={budgets.length > 0}
                        title={budgets.length > 0 ? 'Ya tienes presupuestos' : 'Crear presupuestos para las primeras 6 categorías de gasto'}
                    >
                        Plantilla Rápida
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                            setEditingBudget(null);
                            setFormData({ category_id: '', amount: '', period: 'monthly' });
                            setShowModal(true);
                        }}
                    >
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
                                    <span
                                        className="category-dot"
                                        style={{ '--dot-color': budget.category?.color || '#6B7280' } as React.CSSProperties}
                                    ></span>
                                    <span>{budget.category?.name || 'General'}</span>
                                </div>
                                <span className="period-badge">{PERIOD_LABELS[budget.period]}</span>
                            </div>

                            <div className="budget-amounts">
                                {isFutureMonth ? (
                                    <span className="amount-spent planned-amount">
                                        {currency} {Number(budget.amount).toLocaleString()}
                                    </span>
                                ) : (
                                    <>
                                        <span className="amount-spent">{currency} {budget.spent.toLocaleString()}</span>
                                        <span className="amount-total">/ {currency} {Number(budget.amount).toLocaleString()}</span>
                                    </>
                                )}
                            </div>

                            {!isFutureMonth && (
                                <div className="progress">
                                    <div
                                        className={`progress-bar progress-${budget.status}`}
                                        style={{ '--bar-width': `${Math.min(budget.percentage, 100)}%` } as React.CSSProperties}
                                    ></div>
                                    <div
                                        className="time-marker"
                                        style={{ '--marker-left': `${getDaysProgress(budget.period, selectedMonth) * 100}%` } as React.CSSProperties}
                                        title="Progreso del periodo"
                                    ></div>
                                </div>
                            )}

                            <div className="budget-footer">
                                {isFutureMonth ? (
                                    <span className="remaining planned-label">Monto planeado</span>
                                ) : (
                                    <>
                                        <span className={`remaining ${budget.remaining >= 0 ? 'positive' : 'negative'}`}>
                                            {budget.remaining >= 0
                                                ? `${currency} ${budget.remaining.toLocaleString()} disponible`
                                                : `${currency} ${Math.abs(budget.remaining).toLocaleString()} excedido`}
                                        </span>
                                        <span className="percentage">{budget.percentage.toFixed(0)}%</span>
                                    </>
                                )}
                            </div>

                            {!isFutureMonth && (
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
                            )}

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
                        <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>
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
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Guardando...' : editingBudget ? 'Guardar' : 'Crear Presupuesto'}
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
                        <AlertTriangle size={40} className="delete-icon-warning" />
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
