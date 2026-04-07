import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Plus, Search, Edit2, Trash2, ArrowUpRight, ArrowDownRight, X,
    Upload, Copy, ChevronLeft, ChevronRight, CheckSquare, Square, BarChart3,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { supabase } from '../lib/supabase';
import type { Transaction, Category, Account, Goal } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useSearchParams } from 'react-router-dom';
import { SkeletonTable } from '../components/Skeleton';
import './Transacciones.css';

const PAGE_SIZE = 25;

export function Transacciones() {
    const { user, profile } = useAuth();
    const [searchParams] = useSearchParams();
    const initialNewType = searchParams.get('new');
    const isValidInitialType = initialNewType === 'income' || initialNewType === 'expense';
    const initialSearch = searchParams.get('q') || '';

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(isValidInitialType);
    const [showImport, setShowImport] = useState(false);
    const [editingTx, setEditingTx] = useState<Transaction | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [page, setPage] = useState(0);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const [formData, setFormData] = useState({
        type: (isValidInitialType ? initialNewType : 'expense') as 'income' | 'expense',
        amount: '', category_id: '', account_id: '', goal_id: '', description: '',
        date: format(new Date(), 'yyyy-MM-dd'), is_essential: false, is_recurring: false,
        payment_method: 'debit' as 'cash' | 'debit' | 'credit' | 'transfer' | 'other',
    });

    const currency = profile?.currency || 'USD';

    const showToast = useCallback((msg: string, type: 'success' | 'error') => {
        setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
    }, []);

    const getTransactionsData = useCallback(async (userId: string) => {
        const [txRes, catRes, accRes, goalRes] = await Promise.all([
            supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(2000),
            supabase.from('categories').select('*').or(`user_id.eq.${userId},is_system.eq.true`),
            supabase.from('accounts').select('*').eq('user_id', userId).order('name'),
            supabase.from('goals').select('*').eq('user_id', userId).eq('status', 'active').order('name'),
        ]);
        return { transactions: txRes.data || [], categories: catRes.data || [], accounts: accRes.data || [], goals: goalRes.data || [] };
    }, []);

    const refreshData = useCallback(async () => {
        if (!user) return;
        const data = await getTransactionsData(user.id);
        setTransactions(data.transactions); setCategories(data.categories);
        setAccounts(data.accounts); setGoals(data.goals); setLoading(false);
    }, [user, getTransactionsData]);

    // Auto-generate recurring transactions for current month
    const autoGenRecurring = useCallback(async (userId: string, txList: Transaction[]) => {
        const currentMonth = format(new Date(), 'yyyy-MM');
        const recurring = txList.filter(t => t.is_recurring);
        const templateMap = new Map<string, Transaction>();
        // Get unique recurring by description+type+amount (latest as template)
        for (const t of recurring) {
            const key = `${t.type}-${t.amount}-${t.category_id}-${t.description}`;
            if (!templateMap.has(key) || t.date > (templateMap.get(key)!.date)) templateMap.set(key, t);
        }
        let created = 0;
        for (const [, tmpl] of templateMap) {
            // Check if already exists this month
            const exists = txList.some(t => t.is_recurring && t.date.startsWith(currentMonth) &&
                t.type === tmpl.type && Number(t.amount) === Number(tmpl.amount) && t.category_id === tmpl.category_id);
            if (exists) continue;
            // Create for current month
            const day = tmpl.date.split('-')[2] || '01';
            const newDate = `${currentMonth}-${day}`;
            await supabase.from('transactions').insert({
                user_id: userId, type: tmpl.type, amount: tmpl.amount,
                category_id: tmpl.category_id, account_id: tmpl.account_id,
                description: tmpl.description, date: newDate, is_essential: tmpl.is_essential,
                is_recurring: true, payment_method: tmpl.payment_method,
            });
            created++;
        }
        if (created > 0) showToast(`${created} transacciones recurrentes generadas`, 'success');
        return created;
    }, [showToast]);

    useEffect(() => {
        if (!user) return;
        refreshData().then(() => {
            // Run auto-gen after initial load
            getTransactionsData(user.id).then(data => {
                autoGenRecurring(user.id, data.transactions).then(count => { if (count > 0) refreshData(); });
            });
        });
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const txData = {
            user_id: user!.id, type: formData.type, amount: parseFloat(formData.amount),
            category_id: formData.category_id || null, account_id: formData.account_id || null,
            goal_id: formData.goal_id || null, description: formData.description || null,
            date: formData.date, is_essential: formData.is_essential, is_recurring: formData.is_recurring,
            payment_method: formData.payment_method,
        };
        if (editingTx) await supabase.from('transactions').update(txData).eq('id', editingTx.id);
        else await supabase.from('transactions').insert(txData);
        setShowModal(false); setEditingTx(null); resetForm();
        showToast(editingTx ? 'Transacción actualizada' : 'Transacción creada', 'success');
        refreshData();
    };

    const handleEdit = (tx: Transaction) => {
        setEditingTx(tx);
        setFormData({
            type: tx.type as 'income' | 'expense', amount: tx.amount.toString(),
            category_id: tx.category_id || '', account_id: tx.account_id || '',
            goal_id: tx.goal_id || '', description: tx.description || '', date: tx.date,
            is_essential: tx.is_essential, is_recurring: tx.is_recurring, payment_method: tx.payment_method,
        });
        setShowModal(true);
    };

    const handleDuplicate = async (tx: Transaction) => {
        await supabase.from('transactions').insert({
            user_id: user!.id, type: tx.type, amount: tx.amount,
            category_id: tx.category_id, account_id: tx.account_id, goal_id: tx.goal_id,
            description: tx.description, date: format(new Date(), 'yyyy-MM-dd'),
            is_essential: tx.is_essential, is_recurring: tx.is_recurring, payment_method: tx.payment_method,
        });
        showToast('Transacción duplicada', 'success'); refreshData();
    };

    const handleDelete = async (id: string) => {
        await supabase.from('transactions').delete().eq('id', id);
        showToast('Transacción eliminada', 'success'); refreshData();
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`¿Eliminar ${selectedIds.size} transacciones?`)) return;
        for (const id of selectedIds) await supabase.from('transactions').delete().eq('id', id);
        setSelectedIds(new Set());
        showToast(`${selectedIds.size} transacciones eliminadas`, 'success'); refreshData();
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === paginatedTx.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(paginatedTx.map(t => t.id)));
    };

    // CSV Import
    const handleImportCSV = async (file: File) => {
        if (!user) return;
        const text = await file.text();
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) { showToast('Archivo CSV vacío o sin datos', 'error'); return; }

        const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
        const dateIdx = headers.findIndex(h => h.includes('fecha') || h === 'date');
        const typeIdx = headers.findIndex(h => h.includes('tipo') || h === 'type');
        const amountIdx = headers.findIndex(h => h.includes('monto') || h.includes('amount') || h.includes('valor'));
        const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('concepto') || h.includes('description'));

        if (amountIdx === -1) { showToast('CSV debe tener columna "Monto" o "Amount"', 'error'); return; }

        let imported = 0;
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
            const amount = Math.abs(parseFloat(cols[amountIdx]) || 0);
            if (amount === 0) continue;

            const rawType = typeIdx >= 0 ? cols[typeIdx].toLowerCase() : '';
            const type = rawType.includes('ingreso') || rawType.includes('income') ? 'income' : 'expense';
            const date = dateIdx >= 0 && cols[dateIdx] ? cols[dateIdx] : format(new Date(), 'yyyy-MM-dd');
            const description = descIdx >= 0 ? cols[descIdx] : null;

            await supabase.from('transactions').insert({ user_id: user.id, type, amount, date, description, payment_method: 'other' });
            imported++;
        }
        showToast(`${imported} transacciones importadas`, 'success');
        setShowImport(false); refreshData();
    };

    const resetForm = () => {
        setFormData({
            type: 'expense', amount: '', category_id: '', account_id: '', goal_id: '',
            description: '', date: format(new Date(), 'yyyy-MM-dd'), is_essential: false,
            is_recurring: false, payment_method: 'debit',
        });
    };

    const filteredTransactions = useMemo(() => transactions.filter(tx => {
        const matchesSearch = !searchTerm || tx.description?.toLowerCase().includes(searchTerm.toLowerCase()) || tx.merchant?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = typeFilter === 'all' || tx.type === typeFilter;
        const matchesCategory = categoryFilter === 'all' || tx.category_id === categoryFilter;
        const matchesDateFrom = !dateFrom || tx.date >= dateFrom;
        const matchesDateTo = !dateTo || tx.date <= dateTo;
        return matchesSearch && matchesType && matchesCategory && matchesDateFrom && matchesDateTo;
    }), [transactions, searchTerm, typeFilter, categoryFilter, dateFrom, dateTo]);

    const totalPages = Math.ceil(filteredTransactions.length / PAGE_SIZE);
    const paginatedTx = useMemo(() => filteredTransactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filteredTransactions, page]);

    const { totalIncome, totalExpense } = useMemo(() => {
        let income = 0, expense = 0;
        for (const t of filteredTransactions) { if (t.type === 'income') income += Number(t.amount); else if (t.type === 'expense') expense += Number(t.amount); }
        return { totalIncome: income, totalExpense: expense };
    }, [filteredTransactions]);

    // Category chart data
    const chartData = useMemo(() => {
        const breakdown: Record<string, number> = {};
        for (const t of filteredTransactions) {
            if (t.type !== 'expense') continue;
            const k = t.category_id || 'other';
            breakdown[k] = (breakdown[k] || 0) + Number(t.amount);
        }
        return Object.entries(breakdown)
            .map(([id, value]) => { const c = categories.find(x => x.id === id); return { name: c?.name || 'Otros', value, color: c?.color || '#94A3B8' }; })
            .sort((a, b) => b.value - a.value).slice(0, 6);
    }, [filteredTransactions, categories]);

    const [showChart, setShowChart] = useState(false);

    // Reset page when filters change
    useEffect(() => { setPage(0); }, [searchTerm, typeFilter, categoryFilter, dateFrom, dateTo]);

    if (loading) return <div className="page-content"><SkeletonTable rows={8} /></div>;

    return (
        <div className="transacciones-page animate-fadeIn">
            {toast && <div className={`tx-toast ${toast.type}`}>{toast.msg}</div>}

            {/* Summary Cards */}
            <div className="summary-row">
                <div className="summary-card income"><ArrowUpRight size={24} /><div><span className="label">Ingresos</span><span className="value">{currency} {totalIncome.toLocaleString()}</span></div></div>
                <div className="summary-card expense"><ArrowDownRight size={24} /><div><span className="label">Gastos</span><span className="value">{currency} {totalExpense.toLocaleString()}</span></div></div>
                <div className="summary-card balance"><div><span className="label">Balance</span><span className={`value ${totalIncome - totalExpense >= 0 ? 'positive' : 'negative'}`}>{currency} {(totalIncome - totalExpense).toLocaleString()}</span></div></div>
            </div>

            {/* Chart Toggle */}
            {chartData.length > 0 && (
                <div className="tx-chart-section">
                    <button type="button" className="btn btn-ghost" onClick={() => setShowChart(!showChart)}>
                        <BarChart3 size={16} /> {showChart ? 'Ocultar gráfica' : 'Ver gráfica por categoría'}
                    </button>
                    {showChart && (
                        <div className="tx-chart-container">
                            <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                                        {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                                    </Pie>
                                    <Tooltip formatter={(v: unknown) => [`${currency} ${Number(v).toLocaleString()}`, 'Monto']} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="tx-chart-legend">
                                {chartData.map((e, i) => <div key={i} className="tx-legend-item"><span className="tx-legend-dot" style={{ backgroundColor: e.color }}></span><span>{e.name}: {currency} {e.value.toLocaleString()}</span></div>)}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Toolbar */}
            <div className="toolbar">
                <div className="search-wrapper"><Search size={18} className="search-icon" /><input type="text" placeholder="Buscar transacciones..." className="search-input" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
                <div className="filters">
                    <select className="form-select filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} title="Tipo">
                        <option value="all">Todos</option><option value="income">Ingresos</option><option value="expense">Gastos</option>
                    </select>
                    <select className="form-select filter-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} title="Categoría">
                        <option value="all">Todas las categorías</option>
                        {categories.filter(c => typeFilter === 'all' || c.type === typeFilter || c.type === 'both').map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                    <input type="date" className="form-input date-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Desde" />
                    <input type="date" className="form-input date-input" value={dateTo} onChange={e => setDateTo(e.target.value)} title="Hasta" />
                </div>
                <div className="toolbar-actions">
                    <button className="btn btn-secondary" onClick={() => setShowImport(true)} title="Importar CSV"><Upload size={16} /> Importar</button>
                    {selectedIds.size > 0 && <button className="btn btn-danger" onClick={handleBulkDelete}><Trash2 size={16} /> Eliminar ({selectedIds.size})</button>}
                    <button className="btn btn-primary" onClick={() => { resetForm(); setEditingTx(null); setShowModal(true); }}><Plus size={18} /> Nueva</button>
                </div>
            </div>

            {/* Table */}
            <div className="transactions-table-container">
                <table className="table">
                    <thead>
                        <tr>
                            <th style={{ width: 36 }}><button type="button" className="check-all-btn" onClick={toggleSelectAll} title="Seleccionar todos">{selectedIds.size === paginatedTx.length && paginatedTx.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}</button></th>
                            <th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Cuenta</th><th>Tipo</th><th className="text-right">Monto</th><th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedTx.length > 0 ? paginatedTx.map(tx => {
                            const category = categories.find(c => c.id === tx.category_id);
                            const account = accounts.find(a => a.id === tx.account_id);
                            return (
                                <tr key={tx.id} className={selectedIds.has(tx.id) ? 'selected' : ''}>
                                    <td><button type="button" className="check-btn" onClick={() => toggleSelect(tx.id)} title="Seleccionar">{selectedIds.has(tx.id) ? <CheckSquare size={16} /> : <Square size={16} />}</button></td>
                                    <td>{format(new Date(tx.date + 'T12:00:00'), 'd MMM yyyy', { locale: es })}</td>
                                    <td><div className="tx-desc">{tx.description || 'Sin descripción'}{tx.is_recurring && <span className="badge badge-info">Recurrente</span>}</div></td>
                                    <td><span className="category-tag" style={{ backgroundColor: category?.color || '#6B7280' }}>{category?.name || 'Sin categoría'}</span></td>
                                    <td>{account?.name || '—'}</td>
                                    <td><span className={`type-badge ${tx.type}`}>{tx.type === 'income' ? 'Ingreso' : 'Gasto'}</span></td>
                                    <td className={`text-right amount ${tx.type}`}>{tx.type === 'income' ? '+' : '-'}{currency} {Number(tx.amount).toLocaleString()}</td>
                                    <td>
                                        <div className="actions">
                                            <button className="btn btn-icon btn-ghost" title="Duplicar" onClick={() => handleDuplicate(tx)}><Copy size={14} /></button>
                                            <button className="btn btn-icon btn-ghost" title="Editar" onClick={() => handleEdit(tx)}><Edit2 size={14} /></button>
                                            <button className="btn btn-icon btn-ghost" title="Eliminar" onClick={() => handleDelete(tx.id)}><Trash2 size={14} /></button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        }) : <tr><td colSpan={8} className="text-center">No hay transacciones que mostrar</td></tr>}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="pagination">
                    <span className="page-info">Mostrando {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filteredTransactions.length)} de {filteredTransactions.length}</span>
                    <div className="page-btns">
                        <button className="btn btn-icon btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)} title="Anterior"><ChevronLeft size={18} /></button>
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                            const p = totalPages <= 5 ? i : Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
                            return <button key={p} className={`page-num ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p + 1}</button>;
                        })}
                        <button className="btn btn-icon btn-ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} title="Siguiente"><ChevronRight size={18} /></button>
                    </div>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingTx ? 'Editar Transacción' : 'Nueva Transacción'}</h2>
                            <button type="button" className="btn btn-icon btn-ghost" title="Cerrar" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-body">
                            <div className="type-toggle">
                                <button type="button" className={`toggle-btn ${formData.type === 'income' ? 'active income' : ''}`} onClick={() => setFormData(p => ({ ...p, type: 'income' }))}><ArrowUpRight size={18} /> Ingreso</button>
                                <button type="button" className={`toggle-btn ${formData.type === 'expense' ? 'active expense' : ''}`} onClick={() => setFormData(p => ({ ...p, type: 'expense' }))}><ArrowDownRight size={18} /> Gasto</button>
                            </div>
                            <div className="form-group"><label className="form-label">Monto ({currency})</label><input type="number" className="form-input amount-input" value={formData.amount} onChange={e => setFormData(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" step="0.01" min="0" required /></div>
                            <div className="form-row">
                                <div className="form-group"><label className="form-label">Categoría</label><select className="form-select" value={formData.category_id} onChange={e => setFormData(p => ({ ...p, category_id: e.target.value }))} title="Categoría"><option value="">Seleccionar</option>{categories.filter(c => c.type === formData.type || c.type === 'both').map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></div>
                                <div className="form-group"><label className="form-label">Fecha</label><input type="date" className="form-input" value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))} required /></div>
                            </div>
                            <div className="form-row">
                                <div className="form-group"><label className="form-label">Cuenta</label><select className="form-select" value={formData.account_id} onChange={e => setFormData(p => ({ ...p, account_id: e.target.value }))} title="Cuenta"><option value="">Sin cuenta</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                                <div className="form-group"><label className="form-label">Método de pago</label><select className="form-select" value={formData.payment_method} onChange={e => setFormData(p => ({ ...p, payment_method: e.target.value as typeof formData.payment_method }))} title="Método"><option value="debit">Débito</option><option value="credit">Crédito</option><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="other">Otro</option></select></div>
                            </div>
                            {formData.type === 'income' && goals.length > 0 && (
                                <div className="form-group"><label className="form-label">Vincular a meta</label><select className="form-select" value={formData.goal_id} onChange={e => setFormData(p => ({ ...p, goal_id: e.target.value }))} title="Meta"><option value="">Sin meta</option>{goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
                            )}
                            <div className="form-group"><label className="form-label">Descripción</label><input type="text" className="form-input" value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="Descripción de la transacción" /></div>
                            <div className="form-checkboxes">
                                <label className="checkbox-label"><input type="checkbox" checked={formData.is_essential} onChange={e => setFormData(p => ({ ...p, is_essential: e.target.checked }))} /><span>Esencial</span></label>
                                <label className="checkbox-label"><input type="checkbox" checked={formData.is_recurring} onChange={e => setFormData(p => ({ ...p, is_recurring: e.target.checked }))} /><span>Recurrente</span></label>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">{editingTx ? 'Guardar' : 'Crear'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Import CSV Modal */}
            {showImport && (
                <div className="modal-overlay" onClick={() => setShowImport(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                        <div className="modal-header">
                            <h2>Importar CSV</h2>
                            <button type="button" className="btn btn-icon btn-ghost" title="Cerrar" onClick={() => setShowImport(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                                El CSV debe tener columnas: <strong>Fecha, Tipo, Monto, Descripción</strong> (mínimo "Monto").
                                Tipo acepta: "Ingreso" o "Gasto".
                            </p>
                            <input ref={fileRef} type="file" accept=".csv" className="form-input" style={{ padding: '0.5rem' }}
                                onChange={e => { if (e.target.files?.[0]) handleImportCSV(e.target.files[0]); }} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
