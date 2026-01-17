import { useState, useEffect } from 'react';
import {
    Plus,
    Search,
    Filter,
    Edit2,
    Trash2,
    ArrowUpRight,
    ArrowDownRight,
    X,
    Calendar,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Transaction, Category } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useSearchParams } from 'react-router-dom';
import './Transacciones.css';

export function Transacciones() {
    const { user, profile } = useAuth();
    const [searchParams] = useSearchParams();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingTx, setEditingTx] = useState<Transaction | null>(null);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Form state
    const [formData, setFormData] = useState({
        type: 'expense' as 'income' | 'expense',
        amount: '',
        category_id: '',
        description: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        is_essential: false,
        is_recurring: false,
        payment_method: 'debit' as 'cash' | 'debit' | 'credit' | 'transfer' | 'other',
    });

    const currency = profile?.currency || 'USD';

    useEffect(() => {
        if (user) {
            fetchData();
        }

        // Check if opening modal for new transaction
        const newType = searchParams.get('new');
        if (newType === 'income' || newType === 'expense') {
            setFormData(prev => ({ ...prev, type: newType }));
            setShowModal(true);
        }
    }, [user, searchParams]);

    const fetchData = async () => {
        const { data: txData } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', user!.id)
            .order('date', { ascending: false });

        const { data: catData } = await supabase
            .from('categories')
            .select('*')
            .or(`user_id.eq.${user!.id},is_system.eq.true`);

        setTransactions(txData || []);
        setCategories(catData || []);
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const txData = {
            user_id: user!.id,
            type: formData.type,
            amount: parseFloat(formData.amount),
            category_id: formData.category_id || null,
            description: formData.description || null,
            date: formData.date,
            is_essential: formData.is_essential,
            is_recurring: formData.is_recurring,
            payment_method: formData.payment_method,
        };

        if (editingTx) {
            await supabase
                .from('transactions')
                .update(txData)
                .eq('id', editingTx.id);
        } else {
            await supabase
                .from('transactions')
                .insert(txData);
        }

        setShowModal(false);
        setEditingTx(null);
        resetForm();
        fetchData();
    };

    const handleEdit = (tx: Transaction) => {
        setEditingTx(tx);
        setFormData({
            type: tx.type as 'income' | 'expense',
            amount: tx.amount.toString(),
            category_id: tx.category_id || '',
            description: tx.description || '',
            date: tx.date,
            is_essential: tx.is_essential,
            is_recurring: tx.is_recurring,
            payment_method: tx.payment_method,
        });
        setShowModal(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm('¿Estás seguro de eliminar esta transacción?')) {
            await supabase
                .from('transactions')
                .delete()
                .eq('id', id);
            fetchData();
        }
    };

    const resetForm = () => {
        setFormData({
            type: 'expense',
            amount: '',
            category_id: '',
            description: '',
            date: format(new Date(), 'yyyy-MM-dd'),
            is_essential: false,
            is_recurring: false,
            payment_method: 'debit',
        });
    };

    // Filter transactions
    const filteredTransactions = transactions.filter((tx) => {
        const matchesSearch = !searchTerm ||
            tx.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tx.merchant?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesType = typeFilter === 'all' || tx.type === typeFilter;
        const matchesCategory = categoryFilter === 'all' || tx.category_id === categoryFilter;
        const matchesDateFrom = !dateFrom || tx.date >= dateFrom;
        const matchesDateTo = !dateTo || tx.date <= dateTo;

        return matchesSearch && matchesType && matchesCategory && matchesDateFrom && matchesDateTo;
    });

    // Calculate totals
    const totalIncome = filteredTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalExpense = filteredTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0);

    if (loading) {
        return <div className="loading-container"><div className="loading-spinner"></div></div>;
    }

    return (
        <div className="transacciones-page animate-fadeIn">
            {/* Summary Cards */}
            <div className="summary-row">
                <div className="summary-card income">
                    <ArrowUpRight size={24} />
                    <div>
                        <span className="label">Ingresos</span>
                        <span className="value">{currency} {totalIncome.toLocaleString()}</span>
                    </div>
                </div>
                <div className="summary-card expense">
                    <ArrowDownRight size={24} />
                    <div>
                        <span className="label">Gastos</span>
                        <span className="value">{currency} {totalExpense.toLocaleString()}</span>
                    </div>
                </div>
                <div className="summary-card balance">
                    <div>
                        <span className="label">Balance</span>
                        <span className={`value ${totalIncome - totalExpense >= 0 ? 'positive' : 'negative'}`}>
                            {currency} {(totalIncome - totalExpense).toLocaleString()}
                        </span>
                    </div>
                </div>
            </div>

            {/* Filters & Actions */}
            <div className="toolbar">
                <div className="search-wrapper">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Buscar transacciones..."
                        className="search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="filters">
                    <select
                        className="form-select filter-select"
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                    >
                        <option value="all">Todos los tipos</option>
                        <option value="income">Ingresos</option>
                        <option value="expense">Gastos</option>
                    </select>

                    <select
                        className="form-select filter-select"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                        <option value="all">Todas las categorías</option>
                        {categories
                            .filter(c => typeFilter === 'all' || c.type === typeFilter || c.type === 'both')
                            .map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))
                        }
                    </select>

                    <input
                        type="date"
                        className="form-input date-input"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        placeholder="Desde"
                    />
                    <input
                        type="date"
                        className="form-input date-input"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        placeholder="Hasta"
                    />
                </div>

                <button
                    className="btn btn-primary"
                    onClick={() => {
                        resetForm();
                        setEditingTx(null);
                        setShowModal(true);
                    }}
                >
                    <Plus size={18} />
                    Nueva Transacción
                </button>
            </div>

            {/* Transactions Table */}
            <div className="transactions-table-container">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Descripción</th>
                            <th>Categoría</th>
                            <th>Tipo</th>
                            <th className="text-right">Monto</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTransactions.length > 0 ? (
                            filteredTransactions.map((tx) => {
                                const category = categories.find(c => c.id === tx.category_id);
                                return (
                                    <tr key={tx.id}>
                                        <td>{format(new Date(tx.date), 'd MMM yyyy', { locale: es })}</td>
                                        <td>
                                            <div className="tx-desc">
                                                {tx.description || 'Sin descripción'}
                                                {tx.is_recurring && <span className="badge badge-info">Recurrente</span>}
                                            </div>
                                        </td>
                                        <td>
                                            <span
                                                className="category-tag"
                                                style={{ backgroundColor: category?.color || '#6B7280' }}
                                            >
                                                {category?.name || 'Sin categoría'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`type-badge ${tx.type}`}>
                                                {tx.type === 'income' ? 'Ingreso' : 'Gasto'}
                                            </span>
                                        </td>
                                        <td className={`text-right amount ${tx.type}`}>
                                            {tx.type === 'income' ? '+' : '-'}{currency} {Number(tx.amount).toLocaleString()}
                                        </td>
                                        <td>
                                            <div className="actions">
                                                <button
                                                    className="btn btn-icon btn-ghost"
                                                    onClick={() => handleEdit(tx)}
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    className="btn btn-icon btn-ghost"
                                                    onClick={() => handleDelete(tx.id)}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={6} className="text-center">
                                    No hay transacciones que mostrar
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingTx ? 'Editar Transacción' : 'Nueva Transacción'}</h2>
                            <button className="btn btn-icon btn-ghost" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="modal-body">
                            <div className="type-toggle">
                                <button
                                    type="button"
                                    className={`toggle-btn ${formData.type === 'income' ? 'active income' : ''}`}
                                    onClick={() => setFormData(prev => ({ ...prev, type: 'income' }))}
                                >
                                    <ArrowUpRight size={18} />
                                    Ingreso
                                </button>
                                <button
                                    type="button"
                                    className={`toggle-btn ${formData.type === 'expense' ? 'active expense' : ''}`}
                                    onClick={() => setFormData(prev => ({ ...prev, type: 'expense' }))}
                                >
                                    <ArrowDownRight size={18} />
                                    Gasto
                                </button>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Monto ({currency})</label>
                                <input
                                    type="number"
                                    className="form-input amount-input"
                                    value={formData.amount}
                                    onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                                    placeholder="0.00"
                                    step="0.01"
                                    min="0"
                                    required
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Categoría</label>
                                    <select
                                        className="form-select"
                                        value={formData.category_id}
                                        onChange={(e) => setFormData(prev => ({ ...prev, category_id: e.target.value }))}
                                    >
                                        <option value="">Seleccionar categoría</option>
                                        {categories
                                            .filter(c => c.type === formData.type || c.type === 'both')
                                            .map(cat => (
                                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                                            ))
                                        }
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Fecha</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={formData.date}
                                        onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Descripción</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.description}
                                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Descripción de la transacción"
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Método de pago</label>
                                <select
                                    className="form-select"
                                    value={formData.payment_method}
                                    onChange={(e) => setFormData(prev => ({ ...prev, payment_method: e.target.value as any }))}
                                >
                                    <option value="debit">Débito</option>
                                    <option value="credit">Crédito</option>
                                    <option value="cash">Efectivo</option>
                                    <option value="transfer">Transferencia</option>
                                    <option value="other">Otro</option>
                                </select>
                            </div>

                            <div className="form-checkboxes">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_essential}
                                        onChange={(e) => setFormData(prev => ({ ...prev, is_essential: e.target.checked }))}
                                    />
                                    <span>Es un gasto esencial (necesidad)</span>
                                </label>

                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_recurring}
                                        onChange={(e) => setFormData(prev => ({ ...prev, is_recurring: e.target.checked }))}
                                    />
                                    <span>Es recurrente</span>
                                </label>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingTx ? 'Guardar Cambios' : 'Agregar Transacción'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
