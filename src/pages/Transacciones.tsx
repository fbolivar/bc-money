import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Plus, Search, Edit2, Trash2, ArrowUpRight, ArrowDownRight, X, AlertTriangle,
    Upload, Copy, ChevronLeft, ChevronRight, CheckSquare, Square, BarChart3, Paperclip, Download, ScanLine,
    Percent, Camera,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { supabase } from '../lib/supabase';
import type { Transaction, Category, Account, Goal, Event } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useSearchParams } from 'react-router-dom';
import { SkeletonTable } from '../components/Skeleton';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { parseLocalDate } from '../lib/dates';
import './Transacciones.css';

interface SavingsRule {
    id: string;
    goal_id: string;
    percentage: number;
    active: boolean;
    goals: { name: string; current_amount: number; target_amount: number };
}

const PAGE_SIZE = 25;

interface TransactionAttachment {
    id: string;
    transaction_id: string;
    user_id: string;
    file_name: string;
    file_url: string;
    file_size: number;
    file_type: string;
    created_at: string;
}

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
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(isValidInitialType);
    const [showImport, setShowImport] = useState(false);
    const [editingTx, setEditingTx] = useState<Transaction | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [page, setPage] = useState(0);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [budgetWarning, setBudgetWarning] = useState<{ level: 'warning' | 'danger'; message: string } | null>(null);
    const [savingsRulesModal, setSavingsRulesModal] = useState<{ rules: SavingsRule[]; incomeAmount: number } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const receiptFileRef = useRef<HTMLInputElement>(null);
    const attachmentPanelRef = useRef<HTMLDivElement>(null);
    const ocrFileRef = useRef<HTMLInputElement>(null);
    const cameraRef = useRef<HTMLInputElement>(null);
    const [ocrLoading, setOcrLoading] = useState(false);

    // Attachment state
    const [openAttachmentTxId, setOpenAttachmentTxId] = useState<string | null>(null);
    const [attachments, setAttachments] = useState<Record<string, TransactionAttachment[]>>({});
    const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});
    const [uploadingAttachment, setUploadingAttachment] = useState(false);

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [tagFilter, setTagFilter] = useState<string>('');

    const [formData, setFormData] = useState({
        type: (isValidInitialType ? initialNewType : 'expense') as 'income' | 'expense',
        amount: '', category_id: '', account_id: '', goal_id: '', event_id: '', description: '',
        date: format(new Date(), 'yyyy-MM-dd'), is_essential: false, is_recurring: false,
        payment_method: 'debit' as 'cash' | 'debit' | 'credit' | 'transfer' | 'other',
        tags: [] as string[],
    });
    const [tagInput, setTagInput] = useState('');

    const currency = profile?.currency || 'USD';

    const showToast = useCallback((msg: string, type: 'success' | 'error') => {
        setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
    }, []);

    const getTransactionsData = useCallback(async (userId: string) => {
        const [txRes, catRes, accRes, goalRes, evRes] = await Promise.all([
            supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(2000),
            supabase.from('categories').select('*').or(`user_id.eq.${userId},is_system.eq.true`),
            supabase.from('accounts').select('*').eq('user_id', userId).order('name'),
            supabase.from('goals').select('*').eq('user_id', userId).eq('status', 'active').order('name'),
            supabase.from('events').select('*').eq('user_id', userId).eq('status', 'active').order('name'),
        ]);
        return { transactions: txRes.data || [], categories: catRes.data || [], accounts: accRes.data || [], goals: goalRes.data || [], events: evRes.data || [] };
    }, []);

    const refreshData = useCallback(async () => {
        if (!user) return;
        const data = await getTransactionsData(user.id);
        setTransactions(data.transactions); setCategories(data.categories);
        setAccounts(data.accounts); setGoals(data.goals); setEvents(data.events); setLoading(false);
    }, [user, getTransactionsData]);

    useRealtimeSync(user?.id, refreshData);

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

    useEffect(() => {
        if (formData.type !== 'expense' || !formData.category_id || !formData.amount) {
            setBudgetWarning(null);
            return;
        }
        const amount = parseFloat(formData.amount);
        if (isNaN(amount) || amount <= 0) { setBudgetWarning(null); return; }
        let cancelled = false;
        (async () => {
            const startOfMonth = format(new Date(), 'yyyy-MM-01');
            const [budgetRes, spentRes] = await Promise.all([
                supabase.from('budgets').select('amount').eq('category_id', formData.category_id).eq('period', 'monthly').eq('user_id', user!.id).maybeSingle(),
                supabase.from('transactions').select('amount').eq('category_id', formData.category_id).eq('user_id', user!.id).eq('type', 'expense').gte('date', startOfMonth),
            ]);
            if (cancelled) return;
            const budget = budgetRes.data?.amount;
            if (!budget) { setBudgetWarning(null); return; }
            const spent = (spentRes.data || []).reduce((acc, r) => acc + Number(r.amount), 0);
            const projected = spent + amount;
            const ratio = projected / Number(budget);
            if (ratio >= 1) {
                setBudgetWarning({ level: 'danger', message: `Supera el presupuesto de esta categoría (${currency} ${Number(budget).toLocaleString()})` });
            } else if (ratio >= 0.8) {
                setBudgetWarning({ level: 'warning', message: `Cerca del límite del presupuesto (${currency} ${Number(budget).toLocaleString()})` });
            } else {
                setBudgetWarning(null);
            }
        })();
        return () => { cancelled = true; };
    }, [formData.category_id, formData.amount, formData.type, user, currency]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const dateStr = String(formData.date).slice(0, 10);
        const txAmount = parseFloat(formData.amount);
        const txData = {
            user_id: user!.id, type: formData.type, amount: txAmount,
            category_id: formData.category_id || null, account_id: formData.account_id || null,
            goal_id: formData.goal_id || null, event_id: formData.event_id || null,
            description: formData.description || null,
            date: dateStr, is_essential: formData.is_essential, is_recurring: formData.is_recurring,
            payment_method: formData.payment_method, tags: formData.tags,
        };
        if (editingTx) await supabase.from('transactions').update(txData).eq('id', editingTx.id);
        else await supabase.from('transactions').insert(txData);
        setShowModal(false); setEditingTx(null); resetForm(); setBudgetWarning(null); setTagInput('');
        showToast(editingTx ? 'Transacción actualizada' : 'Transacción creada', 'success');
        refreshData();
        if (!editingTx && formData.type === 'income') {
            const { data: rulesData } = await supabase
                .from('savings_rules')
                .select('id, goal_id, percentage, active, goals(name, current_amount, target_amount)')
                .eq('user_id', user!.id)
                .eq('active', true);
            const rules = (rulesData || []) as unknown as SavingsRule[];
            if (rules.length > 0) setSavingsRulesModal({ rules, incomeAmount: txAmount });
        }
    };

    const handleEdit = (tx: Transaction) => {
        setEditingTx(tx);
        setFormData({
            type: tx.type as 'income' | 'expense', amount: tx.amount.toString(),
            category_id: tx.category_id || '', account_id: tx.account_id || '',
            goal_id: tx.goal_id || '', event_id: tx.event_id || '', description: tx.description || '', date: tx.date,
            is_essential: tx.is_essential, is_recurring: tx.is_recurring, payment_method: tx.payment_method,
            tags: tx.tags || [],
        });
        setTagInput('');
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

    const confirmDelete = async () => {
        if (!deleteId) return;
        if (deleteId === 'bulk') {
            for (const id of selectedIds) await supabase.from('transactions').delete().eq('id', id);
            showToast(`${selectedIds.size} transacciones eliminadas`, 'success');
            setSelectedIds(new Set());
        } else {
            await supabase.from('transactions').delete().eq('id', deleteId);
            showToast('Transacción eliminada', 'success');
        }
        setDeleteId(null); refreshData();
    };

    const handleBulkDelete = () => {
        if (selectedIds.size === 0) return;
        setDeleteId('bulk');
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
            type: 'expense', amount: '', category_id: '', account_id: '', goal_id: '', event_id: '',
            description: '', date: format(new Date(), 'yyyy-MM-dd'), is_essential: false,
            is_recurring: false, payment_method: 'debit', tags: [],
        });
        setBudgetWarning(null);
    };

    const applySavingsRules = async (rules: SavingsRule[], incomeAmount: number) => {
        for (const rule of rules) {
            const contribution = (incomeAmount * rule.percentage) / 100;
            const newAmount = Number(rule.goals.current_amount) + contribution;
            await supabase.from('goals').update({
                current_amount: newAmount,
                status: newAmount >= Number(rule.goals.target_amount) ? 'completed' : 'active',
                completed_at: newAmount >= Number(rule.goals.target_amount) ? new Date().toISOString() : null,
            }).eq('id', rule.goal_id);
        }
        setSavingsRulesModal(null);
        showToast('Ahorros automáticos aplicados', 'success');
        refreshData();
    };

    const handleOcrReceipt = async (file: File) => {
        setOcrLoading(true);
        try {
            const reader = new FileReader();
            const imageBase64 = await new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
            const res = await fetch('/api/ocr-receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
                body: JSON.stringify({ imageBase64, mimeType: file.type }),
            });
            if (!res.ok) throw new Error('OCR failed');
            const data = await res.json() as { amount: number | null; merchant: string | null; date: string | null; description: string | null };
            setFormData(p => ({
                ...p,
                amount: data.amount != null ? String(data.amount) : p.amount,
                description: data.description ?? p.description,
                date: data.date ?? p.date,
            }));
            if (data.merchant) {
                setFormData(p => ({ ...p, description: p.description || data.merchant! }));
            }
            setShowModal(true);
        } catch {
            alert('No se pudo analizar el recibo. Intenta con otra imagen.');
        } finally {
            setOcrLoading(false);
            if (ocrFileRef.current) ocrFileRef.current.value = '';
        }
    };

    // --- Attachment helpers ---
    const fetchAttachmentsForTx = useCallback(async (txId: string) => {
        const { data } = await supabase
            .from('transaction_attachments')
            .select('*')
            .eq('transaction_id', txId)
            .order('created_at', { ascending: false });
        const list = (data as TransactionAttachment[]) || [];
        setAttachments(prev => ({ ...prev, [txId]: list }));
        setAttachmentCounts(prev => ({ ...prev, [txId]: list.length }));
    }, []);

    const fetchAllAttachmentCounts = useCallback(async (txIds: string[]) => {
        if (txIds.length === 0) return;
        const { data } = await supabase
            .from('transaction_attachments')
            .select('transaction_id')
            .in('transaction_id', txIds);
        const counts: Record<string, number> = {};
        for (const row of (data || []) as { transaction_id: string }[]) {
            counts[row.transaction_id] = (counts[row.transaction_id] || 0) + 1;
        }
        setAttachmentCounts(counts);
    }, []);

    const handleOpenAttachmentPanel = useCallback(async (txId: string) => {
        if (openAttachmentTxId === txId) {
            setOpenAttachmentTxId(null);
            return;
        }
        setOpenAttachmentTxId(txId);
        await fetchAttachmentsForTx(txId);
    }, [openAttachmentTxId, fetchAttachmentsForTx]);

    const handleUploadReceipt = useCallback(async (file: File, txId: string) => {
        if (!user) return;
        if (file.size > 5 * 1024 * 1024) { showToast('El archivo excede 5 MB', 'error'); return; }
        setUploadingAttachment(true);
        try {
            const filePath = `${user.id}/${txId}/${Date.now()}_${file.name}`;
            const { error: uploadError } = await supabase.storage.from('receipts').upload(filePath, file);
            if (uploadError) { showToast('Error al subir archivo', 'error'); return; }
            const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(filePath);
            await supabase.from('transaction_attachments').insert({
                transaction_id: txId,
                user_id: user.id,
                file_name: file.name,
                file_url: urlData.publicUrl,
                file_size: file.size,
                file_type: file.type,
            });
            showToast('Recibo adjuntado', 'success');
            await fetchAttachmentsForTx(txId);
        } finally {
            setUploadingAttachment(false);
        }
    }, [user, showToast, fetchAttachmentsForTx]);

    const handleDeleteAttachment = useCallback(async (attachment: TransactionAttachment) => {
        await supabase.from('transaction_attachments').delete().eq('id', attachment.id);
        // Extract storage path from public URL
        const urlParts = attachment.file_url.split('/receipts/');
        if (urlParts.length > 1) {
            await supabase.storage.from('receipts').remove([urlParts[1]]);
        }
        showToast('Adjunto eliminado', 'success');
        await fetchAttachmentsForTx(attachment.transaction_id);
    }, [showToast, fetchAttachmentsForTx]);

    // Close attachment panel when clicking outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (attachmentPanelRef.current && !attachmentPanelRef.current.contains(e.target as Node)) {
                // Check if click is on a paperclip button (has data-txid)
                const target = e.target as HTMLElement;
                if (!target.closest('[data-attachment-btn]')) {
                    setOpenAttachmentTxId(null);
                }
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Load attachment counts whenever transactions change
    useEffect(() => {
        if (transactions.length > 0) {
            fetchAllAttachmentCounts(transactions.map(t => t.id));
        }
    }, [transactions, fetchAllAttachmentCounts]);

    const filteredTransactions = useMemo(() => transactions.filter(tx => {
        const matchesSearch = !searchTerm || tx.description?.toLowerCase().includes(searchTerm.toLowerCase()) || tx.merchant?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = typeFilter === 'all' || tx.type === typeFilter;
        const matchesCategory = categoryFilter === 'all' || tx.category_id === categoryFilter;
        const matchesDateFrom = !dateFrom || tx.date >= dateFrom;
        const matchesDateTo = !dateTo || tx.date <= dateTo;
        const matchesTag = !tagFilter || (tx.tags || []).includes(tagFilter);
        return matchesSearch && matchesType && matchesCategory && matchesDateFrom && matchesDateTo && matchesTag;
    }), [transactions, searchTerm, typeFilter, categoryFilter, dateFrom, dateTo, tagFilter]);

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

    useEffect(() => { setPage(0); }, [searchTerm, typeFilter, categoryFilter, dateFrom, dateTo, tagFilter]);

    const handleExport = () => {
        const rows = filteredTransactions.map(tx => ({
            Fecha: tx.date,
            Descripción: tx.description || '',
            Tipo: tx.type === 'income' ? 'Ingreso' : tx.type === 'expense' ? 'Gasto' : 'Transferencia',
            Categoría: categories.find(c => c.id === tx.category_id)?.name || '',
            Cuenta: accounts.find(a => a.id === tx.account_id)?.name || '',
            Monto: tx.amount,
            Esencial: tx.is_essential ? 'Sí' : 'No',
            'Método pago': tx.payment_method,
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Transacciones');
        XLSX.writeFile(wb, `transacciones_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };

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
                    <input type="text" className="form-input tag-filter-input" value={tagFilter} onChange={e => setTagFilter(e.target.value)} placeholder="Filtrar por tag" title="Filtrar por tag" />
                </div>
                <div className="toolbar-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowImport(true)} title="Importar CSV"><Upload size={16} /> Importar</button>
                    <button type="button" className="btn btn-secondary" onClick={handleExport} title="Exportar a Excel" disabled={filteredTransactions.length === 0}><Download size={16} /> Exportar</button>
                    {selectedIds.size > 0 && <button type="button" className="btn btn-danger" onClick={handleBulkDelete}><Trash2 size={16} /> Eliminar ({selectedIds.size})</button>}
                    <input ref={ocrFileRef} type="file" accept="image/*" aria-label="Seleccionar imagen de recibo" title="Seleccionar imagen de recibo" className="receipt-file-input" onChange={e => { const f = e.target.files?.[0]; if (f) { resetForm(); setEditingTx(null); handleOcrReceipt(f); } }} />
                    <input ref={cameraRef} type="file" accept="image/*" capture="environment" aria-label="Tomar foto de recibo" title="Tomar foto de recibo" className="receipt-file-input" onChange={e => { const f = e.target.files?.[0]; if (f) { resetForm(); setEditingTx(null); handleOcrReceipt(f); } }} />
                    <button type="button" className="btn btn-secondary" title="Analizar recibo con IA" disabled={ocrLoading} onClick={() => ocrFileRef.current?.click()}><ScanLine size={16} /> {ocrLoading ? 'Analizando…' : 'Analizar recibo'}</button>
                    <button type="button" className="btn btn-secondary" title="Foto con cámara" disabled={ocrLoading} onClick={() => cameraRef.current?.click()}><Camera size={16} /> Cámara</button>
                    <button type="button" className="btn btn-primary" onClick={() => { resetForm(); setEditingTx(null); setShowModal(true); }}><Plus size={18} /> Nueva</button>
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
                            const txAttachCount = attachmentCounts[tx.id] || 0;
                            const isAttachOpen = openAttachmentTxId === tx.id;
                            const txAttachList = attachments[tx.id] || [];
                            return (
                                <>
                                    <tr key={tx.id} className={selectedIds.has(tx.id) ? 'selected' : ''}>
                                        <td><button type="button" className="check-btn" onClick={() => toggleSelect(tx.id)} title="Seleccionar">{selectedIds.has(tx.id) ? <CheckSquare size={16} /> : <Square size={16} />}</button></td>
                                        <td>{format(parseLocalDate(tx.date), 'd MMM yyyy', { locale: es })}</td>
                                        <td>
                                            <div className="tx-desc">{tx.description || 'Sin descripción'}{tx.is_recurring && <span className="badge badge-info">Recurrente</span>}</div>
                                            {tx.tags && tx.tags.length > 0 && (
                                                <div className="tx-tags-row">
                                                    {tx.tags.map(tag => (
                                                        <span key={tag} className="tx-tag-chip" onClick={() => setTagFilter(tag)} title={`Filtrar por "${tag}"`}>{tag}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                        <td><span className="category-tag" style={{ backgroundColor: category?.color || '#6B7280' }}>{category?.name || 'Sin categoría'}</span></td>
                                        <td>{account?.name || '—'}</td>
                                        <td><span className={`type-badge ${tx.type}`}>{tx.type === 'income' ? 'Ingreso' : 'Gasto'}</span></td>
                                        <td className={`text-right amount ${tx.type}`}>{tx.type === 'income' ? '+' : '-'}{currency} {Number(tx.amount).toLocaleString()}</td>
                                        <td>
                                            <div className="actions">
                                                <button
                                                    type="button"
                                                    className={`btn btn-icon btn-ghost attachment-btn ${isAttachOpen ? 'active' : ''}`}
                                                    title="Recibos adjuntos"
                                                    data-attachment-btn="true"
                                                    onClick={() => handleOpenAttachmentPanel(tx.id)}
                                                >
                                                    <Paperclip size={14} />
                                                    {txAttachCount > 0 && <span className="attach-badge">{txAttachCount}</span>}
                                                </button>
                                                <button type="button" className="btn btn-icon btn-ghost" title="Duplicar" onClick={() => handleDuplicate(tx)}><Copy size={14} /></button>
                                                <button type="button" className="btn btn-icon btn-ghost" title="Editar" onClick={() => handleEdit(tx)}><Edit2 size={14} /></button>
                                                <button type="button" className="btn btn-icon btn-ghost" title="Eliminar" onClick={() => setDeleteId(tx.id)}><Trash2 size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                    {isAttachOpen && (
                                        <tr key={`${tx.id}-attach`} className="attachment-panel-row">
                                            <td colSpan={8} className="attachment-panel-cell">
                                                <div className="attachment-panel" ref={attachmentPanelRef}>
                                                    <div className="attachment-panel-header">
                                                        <Paperclip size={14} />
                                                        <span>Recibos y adjuntos</span>
                                                        <button
                                                            type="button"
                                                            className="btn btn-icon btn-ghost attach-close-btn"
                                                            onClick={() => setOpenAttachmentTxId(null)}
                                                            title="Cerrar"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                    <div className="attachment-list">
                                                        {txAttachList.length === 0 ? (
                                                            <p className="attachment-empty">Sin adjuntos aún</p>
                                                        ) : txAttachList.map(att => (
                                                            <div key={att.id} className="attachment-item">
                                                                <a
                                                                    href={att.file_url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="attachment-name"
                                                                    title={att.file_name}
                                                                >
                                                                    <Paperclip size={12} />
                                                                    <span>{att.file_name}</span>
                                                                    <span className="attachment-size">({(att.file_size / 1024).toFixed(0)} KB)</span>
                                                                </a>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-icon btn-ghost attach-delete-btn"
                                                                    title="Eliminar adjunto"
                                                                    onClick={() => handleDeleteAttachment(att)}
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="attachment-upload-row">
                                                        <input
                                                            ref={receiptFileRef}
                                                            type="file"
                                                            accept="image/*,application/pdf"
                                                            className="receipt-file-input"
                                                            aria-label="Adjuntar recibo"
                                                            title="Adjuntar recibo"
                                                            onChange={async e => {
                                                                const f = e.target.files?.[0];
                                                                if (f) await handleUploadReceipt(f, tx.id);
                                                                if (receiptFileRef.current) receiptFileRef.current.value = '';
                                                            }}
                                                        />
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary attach-upload-btn"
                                                            disabled={uploadingAttachment}
                                                            onClick={() => receiptFileRef.current?.click()}
                                                        >
                                                            <Upload size={13} />
                                                            {uploadingAttachment ? 'Subiendo…' : 'Adjuntar recibo'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
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
                                <div className="form-group">
                                    <label className="form-label">Categoría</label>
                                    <select className="form-select" value={formData.category_id} onChange={e => setFormData(p => ({ ...p, category_id: e.target.value }))} title="Categoría">
                                        <option value="">Seleccionar</option>
                                        {categories.filter(c => c.type === formData.type || c.type === 'both').map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                                    </select>
                                    {budgetWarning && (
                                        <div className={`budget-warning budget-warning--${budgetWarning.level}`}>
                                            <AlertTriangle size={14} />
                                            <span>{budgetWarning.message}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="form-group"><label className="form-label">Fecha</label><input type="date" className="form-input" value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))} required /></div>
                            </div>
                            <div className="form-row">
                                <div className="form-group"><label className="form-label">Cuenta</label><select className="form-select" value={formData.account_id} onChange={e => setFormData(p => ({ ...p, account_id: e.target.value }))} title="Cuenta"><option value="">Sin cuenta</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                                <div className="form-group"><label className="form-label">Método de pago</label><select className="form-select" value={formData.payment_method} onChange={e => setFormData(p => ({ ...p, payment_method: e.target.value as typeof formData.payment_method }))} title="Método"><option value="debit">Débito</option><option value="credit">Crédito</option><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="other">Otro</option></select></div>
                            </div>
                            {formData.type === 'income' && goals.length > 0 && (
                                <div className="form-group"><label className="form-label">Vincular a meta</label><select className="form-select" value={formData.goal_id} onChange={e => setFormData(p => ({ ...p, goal_id: e.target.value }))} title="Meta"><option value="">Sin meta</option>{goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
                            )}
                            {events.length > 0 && (
                                <div className="form-group"><label className="form-label">Evento</label><select className="form-select" value={formData.event_id} onChange={e => setFormData(p => ({ ...p, event_id: e.target.value }))} title="Evento">{<option value="">Sin evento</option>}{events.map(ev => <option key={ev.id} value={ev.id}>{ev.emoji} {ev.name}</option>)}</select></div>
                            )}
                            <div className="form-group"><label className="form-label">Descripción</label><input type="text" className="form-input" value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="Descripción de la transacción" /></div>
                            <div className="form-group">
                                <label className="form-label">Etiquetas</label>
                                <div className="tags-input-container">
                                    {formData.tags.map(tag => (
                                        <span key={tag} className="tag-chip">
                                            {tag}
                                            <button type="button" className="tag-chip-remove" onClick={() => setFormData(p => ({ ...p, tags: p.tags.filter(t => t !== tag) }))} title="Eliminar etiqueta"><X size={10} /></button>
                                        </span>
                                    ))}
                                    {formData.tags.length < 10 && (
                                        <input
                                            type="text"
                                            className="tag-input-field"
                                            value={tagInput}
                                            onChange={e => setTagInput(e.target.value)}
                                            onKeyDown={e => {
                                                if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                                                    e.preventDefault();
                                                    const newTag = tagInput.trim().replace(/,$/, '');
                                                    if (newTag && !formData.tags.includes(newTag)) {
                                                        setFormData(p => ({ ...p, tags: [...p.tags, newTag] }));
                                                    }
                                                    setTagInput('');
                                                } else if (e.key === 'Backspace' && !tagInput && formData.tags.length > 0) {
                                                    setFormData(p => ({ ...p, tags: p.tags.slice(0, -1) }));
                                                }
                                            }}
                                            placeholder={formData.tags.length === 0 ? 'Escribe y presiona Enter o coma…' : ''}
                                        />
                                    )}
                                </div>
                            </div>
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

            {/* Savings Rules Auto-Apply Modal */}
            {savingsRulesModal && (
                <div className="modal-overlay" onClick={() => setSavingsRulesModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header">
                            <h2>Ahorros automáticos</h2>
                            <button type="button" className="btn btn-icon btn-ghost" title="Cerrar" onClick={() => setSavingsRulesModal(null)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                                Tienes reglas de ahorro configuradas. ¿Deseas aplicarlas a este ingreso de <strong>{currency} {savingsRulesModal.incomeAmount.toLocaleString()}</strong>?
                            </p>
                            <div className="savings-rules-list">
                                {savingsRulesModal.rules.map(rule => (
                                    <div key={rule.id} className="savings-rule-row">
                                        <Percent size={14} />
                                        <span>{rule.percentage}% → {rule.goals.name}</span>
                                        <span className="savings-rule-amount">= {currency} {((savingsRulesModal.incomeAmount * rule.percentage) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="modal-actions savings-rules-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setSavingsRulesModal(null)}>Omitir</button>
                                <button type="button" className="btn btn-primary" onClick={() => applySavingsRules(savingsRulesModal.rules, savingsRulesModal.incomeAmount)}>Aplicar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteId && (
                <div className="modal-overlay" onClick={() => setDeleteId(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, textAlign: 'center', padding: '2rem' }}>
                        <AlertTriangle size={40} color="#F59E0B" />
                        <h2 style={{ margin: '1rem 0 0.5rem', fontSize: '1.1rem' }}>
                            {deleteId === 'bulk' ? `¿Eliminar ${selectedIds.size} transacciones?` : '¿Eliminar esta transacción?'}
                        </h2>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>Esta acción no se puede deshacer.</p>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancelar</button>
                            <button type="button" className="btn btn-danger" onClick={confirmDelete}>Eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
