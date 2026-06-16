import { useState, useEffect, useCallback } from 'react';
import { X, Plus, TrendingUp, TrendingDown, Bookmark, BookmarkCheck, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import type { Category, Account } from '../lib/supabase';
import { dispatchTxSaved } from '../hooks/useRealtimeSync';
import './QuickAddModal.css';

interface Props {
    onClose: () => void;
    onSaved: () => void;
}

interface Template {
    id: string;
    type: 'income' | 'expense';
    amount: string;
    categoryId: string;
    accountId: string;
    description: string;
    label: string;
}

const TEMPLATES_KEY = 'qam_templates_v1';

function loadTemplates(): Template[] {
    try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]'); } catch { return []; }
}
function saveTemplates(ts: Template[]) {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(ts));
}

const CURRENCIES = [
    { value: 'COP', label: 'COP' },
    { value: 'USD', label: 'USD' },
    { value: 'EUR', label: 'EUR' },
    { value: 'MXN', label: 'MXN' },
    { value: 'GBP', label: 'GBP' },
];

export function QuickAddModal({ onClose, onSaved }: Props) {
    const { user, profile } = useAuth();
    const [type, setType] = useState<'income' | 'expense'>('expense');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState(profile?.currency || 'COP');
    const [categoryId, setCategoryId] = useState('');
    const [accountId, setAccountId] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [categories, setCategories] = useState<Category[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [templates, setTemplates] = useState<Template[]>(loadTemplates);
    const [showTemplates, setShowTemplates] = useState(false);
    const [savedFeedback, setSavedFeedback] = useState(false);

    useEffect(() => {
        if (profile?.currency) setCurrency(profile.currency);
    }, [profile?.currency]);

    const loadData = useCallback(async () => {
        if (!user) return;
        const [catRes, accRes] = await Promise.all([
            supabase.from('categories').select('*').order('name'),
            supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true).order('name'),
        ]);
        setCategories(catRes.data || []);
        setAccounts(accRes.data || []);
        if (accRes.data?.length) setAccountId(accRes.data[0].id);
    }, [user]);

    useEffect(() => { loadData(); }, [loadData]);

    const filteredCats = categories.filter(c =>
        type === 'income' ? c.type === 'income' || c.type === 'both' : c.type === 'expense' || c.type === 'both'
    );

    function applyTemplate(t: Template) {
        setType(t.type);
        setAmount(t.amount);
        setCategoryId(t.categoryId);
        setAccountId(t.accountId);
        setDescription(t.description);
        setShowTemplates(false);
    }

    function saveAsTemplate() {
        if (!amount || Number(amount) <= 0) return;
        const cat = categories.find(c => c.id === categoryId);
        const label = description || cat?.name || `${type === 'expense' ? 'Gasto' : 'Ingreso'} ${amount}`;
        const t: Template = {
            id: Date.now().toString(),
            type, amount, categoryId, accountId, description,
            label,
        };
        const updated = [t, ...templates].slice(0, 12);
        setTemplates(updated);
        saveTemplates(updated);
        setSavedFeedback(true);
        setTimeout(() => setSavedFeedback(false), 1500);
    }

    function deleteTemplate(id: string) {
        const updated = templates.filter(t => t.id !== id);
        setTemplates(updated);
        saveTemplates(updated);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || !amount || Number(amount) <= 0) { setError('Ingresa un monto válido'); return; }
        setSaving(true);
        setError('');
        try {
            const { error: err } = await supabase.from('transactions').insert({
                user_id: user.id,
                type,
                amount: parseFloat(amount),
                currency,
                category_id: categoryId || null,
                account_id: accountId || null,
                description: description || null,
                date,
                payment_method: 'other',
                is_essential: false,
                is_recurring: false,
                is_split: false,
                tags: [],
            });
            if (err) throw err;
            dispatchTxSaved();
            onSaved();
            onClose();
        } catch {
            setError('Error al guardar. Intenta de nuevo.');
            setSaving(false);
        }
    }

    return (
        <div className="qam-overlay" onClick={onClose}>
            <div className="qam-panel" onClick={e => e.stopPropagation()}>
                <div className="qam-header">
                    <h2>Agregar transacción</h2>
                    <div className="qam-header-actions">
                        <button
                            type="button"
                            title={templates.length > 0 ? `Plantillas (${templates.length})` : 'Sin plantillas guardadas'}
                            className={`qam-tpl-btn ${showTemplates ? 'active' : ''}`}
                            onClick={() => setShowTemplates(v => !v)}
                        >
                            <Bookmark size={17} />
                            {templates.length > 0 && <span className="qam-tpl-count">{templates.length}</span>}
                        </button>
                        <button type="button" title="Cerrar" className="qam-close" onClick={onClose}><X size={20} /></button>
                    </div>
                </div>

                {/* Templates panel */}
                {showTemplates && (
                    <div className="qam-templates">
                        {templates.length === 0 ? (
                            <p className="qam-tpl-empty">Sin plantillas. Llena el formulario y usa el ícono <BookmarkCheck size={13} /> para guardar.</p>
                        ) : templates.map(t => (
                            <div key={t.id} className="qam-tpl-item">
                                <button type="button" className="qam-tpl-apply" onClick={() => applyTemplate(t)}>
                                    <span className={`qam-tpl-dot ${t.type}`} />
                                    <span className="qam-tpl-label">{t.label}</span>
                                    <span className="qam-tpl-amt">{currency} {Number(t.amount).toLocaleString()}</span>
                                </button>
                                <button type="button" className="qam-tpl-del" title="Eliminar plantilla" onClick={() => deleteTemplate(t.id)}>
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="qam-form">
                    {/* Type toggle */}
                    <div className="qam-type-row">
                        <button type="button" className={`qam-type-btn ${type === 'expense' ? 'active expense' : ''}`} onClick={() => { setType('expense'); setCategoryId(''); }}>
                            <TrendingDown size={16} /> Gasto
                        </button>
                        <button type="button" className={`qam-type-btn ${type === 'income' ? 'active income' : ''}`} onClick={() => { setType('income'); setCategoryId(''); }}>
                            <TrendingUp size={16} /> Ingreso
                        </button>
                    </div>

                    {/* Amount + Currency */}
                    <div className="qam-field">
                        <div className="qam-amount-row">
                            <label>Monto</label>
                            <button
                                type="button"
                                className={`qam-save-tpl ${savedFeedback ? 'saved' : ''}`}
                                title="Guardar como plantilla"
                                onClick={saveAsTemplate}
                            >
                                {savedFeedback ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                                {savedFeedback ? 'Guardada' : 'Guardar plantilla'}
                            </button>
                        </div>
                        <div className="qam-amount-currency-row">
                            <select
                                className="qam-select qam-currency-select"
                                value={currency}
                                onChange={e => setCurrency(e.target.value)}
                                title="Moneda"
                            >
                                {CURRENCIES.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </select>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                className="qam-input qam-amount"
                                autoFocus
                                required
                            />
                        </div>
                    </div>

                    <div className="qam-row">
                        {/* Category */}
                        <div className="qam-field">
                            <label>Categoría</label>
                            <select className="qam-select" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                                <option value="">Sin categoría</option>
                                {filteredCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>

                        {/* Account */}
                        {accounts.length > 0 && (
                            <div className="qam-field">
                                <label>Cuenta</label>
                                <select className="qam-select" value={accountId} onChange={e => setAccountId(e.target.value)}>
                                    <option value="">Sin cuenta</option>
                                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                        )}
                    </div>

                    <div className="qam-row">
                        {/* Description */}
                        <div className="qam-field">
                            <label>Descripción</label>
                            <input type="text" className="qam-input" placeholder="Opcional" value={description} onChange={e => setDescription(e.target.value)} />
                        </div>

                        {/* Date */}
                        <div className="qam-field">
                            <label>Fecha</label>
                            <input type="date" className="qam-input" value={date} onChange={e => setDate(e.target.value)} required />
                        </div>
                    </div>

                    {error && <p className="qam-error">{error}</p>}

                    <button type="submit" className={`qam-submit ${type}`} disabled={saving}>
                        <Plus size={18} />
                        {saving ? 'Guardando...' : `Guardar ${type === 'expense' ? 'gasto' : 'ingreso'}`}
                    </button>
                </form>
            </div>
        </div>
    );
}
