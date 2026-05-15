import { useState, useEffect, useCallback } from 'react';
import { X, Plus, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import type { Category, Account } from '../lib/supabase';
import './QuickAddModal.css';

interface Props {
    onClose: () => void;
    onSaved: () => void;
}

export function QuickAddModal({ onClose, onSaved }: Props) {
    const { user, profile } = useAuth();
    const currency = profile?.currency || 'COP';
    const [type, setType] = useState<'income' | 'expense'>('expense');
    const [amount, setAmount] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [accountId, setAccountId] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [categories, setCategories] = useState<Category[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const loadData = useCallback(async () => {
        if (!user) return;
        const [catRes, accRes] = await Promise.all([
            supabase.from('categories').select('*').or(`user_id.eq.${user.id},is_system.eq.true`).order('name'),
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
                    <button type="button" title="Cerrar" className="qam-close" onClick={onClose}><X size={20} /></button>
                </div>

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

                    {/* Amount */}
                    <div className="qam-field">
                        <label>Monto ({currency})</label>
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
