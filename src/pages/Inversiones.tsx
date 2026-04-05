import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Plus, Edit2, Trash2, X, Search, AlertTriangle, TrendingUp, TrendingDown, RefreshCw,
    BarChart3, Bitcoin, Building, Landmark, Gem, Package,
    type LucideIcon,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { supabase } from '../lib/supabase';
import type { Investment } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import './Inversiones.css';

const TYPES: { value: Investment['type']; label: string; icon: LucideIcon }[] = [
    { value: 'stock', label: 'Acción', icon: BarChart3 },
    { value: 'crypto', label: 'Cripto', icon: Bitcoin },
    { value: 'bond', label: 'Bono', icon: Landmark },
    { value: 'fund', label: 'Fondo', icon: Building },
    { value: 'real_estate', label: 'Inmueble', icon: Building },
    { value: 'commodity', label: 'Commodity', icon: Gem },
    { value: 'other', label: 'Otro', icon: Package },
];
const TYPE_LABELS = Object.fromEntries(TYPES.map(t => [t.value, t.label]));
const TYPE_ICONS: Record<string, LucideIcon> = Object.fromEntries(TYPES.map(t => [t.value, t.icon]));
const COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#64748B'];

function fmt(n: number, c: string) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: c, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n); }

export function Inversiones() {
    const { user, profile } = useAuth();
    const [investments, setInvestments] = useState<Investment[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isModal, setIsModal] = useState(false);
    const [editing, setEditing] = useState<Investment | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<Investment | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [form, setForm] = useState({ name: '', type: 'stock' as Investment['type'], symbol: '', quantity: '', purchase_price: '', current_price: '', currency: 'USD', purchase_date: format(new Date(), 'yyyy-MM-dd'), color: '#8B5CF6', notes: '' });

    const currency = profile?.currency || 'USD';
    const showToast = useCallback((msg: string, type: 'success' | 'error') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }, []);

    const fetchData = useCallback(async () => {
        if (!user) return;
        const { data } = await supabase.from('investments').select('*').eq('user_id', user.id).order('created_at');
        setInvestments(data || []); setLoading(false);
    }, [user]);

    useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

    const filtered = useMemo(() => {
        if (!searchTerm) return investments;
        const t = searchTerm.toLowerCase();
        return investments.filter(i => i.name.toLowerCase().includes(t) || (i.symbol || '').toLowerCase().includes(t));
    }, [investments, searchTerm]);

    const totalInvested = useMemo(() => investments.reduce((s, i) => s + i.quantity * i.purchase_price, 0), [investments]);
    const totalCurrent = useMemo(() => investments.reduce((s, i) => s + i.quantity * (i.current_price || i.purchase_price), 0), [investments]);
    const totalGain = totalCurrent - totalInvested;
    const totalPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

    const pieData = useMemo(() => investments.map(i => ({
        name: i.symbol || i.name, value: i.quantity * (i.current_price || i.purchase_price), color: i.color,
    })).filter(d => d.value > 0), [investments]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || saving) return;
        setSaving(true);
        const data = {
            user_id: user.id, name: form.name, type: form.type, symbol: form.symbol || null,
            quantity: parseFloat(form.quantity) || 0, purchase_price: parseFloat(form.purchase_price) || 0,
            current_price: form.current_price ? parseFloat(form.current_price) : null,
            currency: form.currency, purchase_date: form.purchase_date, color: form.color, notes: form.notes || null,
        };
        if (editing) { await supabase.from('investments').update(data).eq('id', editing.id); showToast('Inversión actualizada', 'success'); }
        else { await supabase.from('investments').insert(data); showToast('Inversión registrada', 'success'); }
        setIsModal(false); setEditing(null); resetForm(); setSaving(false); fetchData();
    }

    async function updatePrice(id: string, price: string) {
        if (!price) return;
        await supabase.from('investments').update({ current_price: parseFloat(price), updated_at: new Date().toISOString() }).eq('id', id);
        fetchData();
    }

    async function handleDelete(inv: Investment) {
        await supabase.from('investments').delete().eq('id', inv.id);
        setDeleteConfirm(null); showToast('Inversión eliminada', 'success'); fetchData();
    }

    function openEdit(inv: Investment) {
        setEditing(inv);
        setForm({ name: inv.name, type: inv.type, symbol: inv.symbol || '', quantity: inv.quantity.toString(), purchase_price: inv.purchase_price.toString(), current_price: inv.current_price?.toString() || '', currency: inv.currency, purchase_date: inv.purchase_date, color: inv.color, notes: inv.notes || '' });
        setIsModal(true);
    }

    function resetForm() { setForm({ name: '', type: 'stock', symbol: '', quantity: '', purchase_price: '', current_price: '', currency: 'USD', purchase_date: format(new Date(), 'yyyy-MM-dd'), color: '#8B5CF6', notes: '' }); }

    if (loading) return <div className="loading-container"><div className="loading-spinner"></div></div>;

    return (
        <div className="inv-page animate-fadeIn">
            {toast && <div className={`inv-toast ${toast.type}`}>{toast.msg}</div>}
            <div className="inv-header"><div><h1>Inversiones</h1><p>Portfolio y rendimiento de tus inversiones</p></div></div>

            {/* Summary */}
            <div className="inv-summary">
                <div className="inv-sum-card invested"><span className="inv-sum-label">Total Invertido</span><span className="inv-sum-value">{fmt(totalInvested, currency)}</span></div>
                <div className="inv-sum-card current"><span className="inv-sum-label">Valor Actual</span><span className="inv-sum-value">{fmt(totalCurrent, currency)}</span></div>
                <div className={`inv-sum-card gain ${totalGain >= 0 ? 'positive' : 'negative'}`}>
                    <span className="inv-sum-label">Ganancia/Pérdida</span>
                    <span className="inv-sum-value">{totalGain >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />} {fmt(totalGain, currency)} ({totalPct.toFixed(1)}%)</span>
                </div>
                <div className="inv-sum-card"><span className="inv-sum-label">Activos</span><span className="inv-sum-value">{investments.length}</span></div>
            </div>

            {/* Chart */}
            {pieData.length > 0 && (
                <div className="inv-chart-row">
                    <div className="inv-card"><h3>Distribución del Portfolio</h3>
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Pie><Tooltip formatter={(v: unknown) => [fmt(Number(v), currency), '']} /></PieChart>
                        </ResponsiveContainer>
                        <div className="inv-legend">{pieData.map((e, i) => <div key={i} className="inv-leg-item"><span className="inv-leg-dot" style={{ backgroundColor: e.color }}></span>{e.name}: {fmt(e.value, currency)}</div>)}</div>
                    </div>
                </div>
            )}

            <div className="inv-search-row">
                <div className="inv-search"><Search size={18} className="search-icon" /><input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" /></div>
            </div>

            {/* Investment Cards */}
            {filtered.length === 0 ? (
                <div className="inv-empty"><BarChart3 size={48} /><h3>Sin inversiones registradas</h3><button type="button" className="btn btn-primary" onClick={() => { resetForm(); setEditing(null); setIsModal(true); }}><Plus size={16} /> Agregar</button></div>
            ) : (
                <div className="inv-grid">
                    {filtered.map(inv => {
                        const Icon = TYPE_ICONS[inv.type] || Package;
                        const currentVal = inv.quantity * (inv.current_price || inv.purchase_price);
                        const investedVal = inv.quantity * inv.purchase_price;
                        const gain = currentVal - investedVal;
                        const pct = investedVal > 0 ? (gain / investedVal) * 100 : 0;
                        return (
                            <div key={inv.id} className="inv-card-item" style={{ borderLeftColor: inv.color }}>
                                <div className="inv-card-header">
                                    <div className="inv-card-icon" style={{ backgroundColor: `${inv.color}20`, color: inv.color }}><Icon size={20} /></div>
                                    <div className="inv-card-actions">
                                        <button type="button" title="Editar" className="inv-btn" onClick={() => openEdit(inv)}><Edit2 size={14} /></button>
                                        <button type="button" title="Eliminar" className="inv-btn del" onClick={() => setDeleteConfirm(inv)}><Trash2 size={14} /></button>
                                    </div>
                                </div>
                                <h3>{inv.name}</h3>
                                <span className="inv-meta">{TYPE_LABELS[inv.type]}{inv.symbol ? ` · ${inv.symbol}` : ''}</span>
                                <div className="inv-values">
                                    <div><span className="inv-val-label">Cantidad</span><span className="inv-val">{inv.quantity}</span></div>
                                    <div><span className="inv-val-label">Precio Compra</span><span className="inv-val">{fmt(inv.purchase_price, inv.currency)}</span></div>
                                    <div><span className="inv-val-label">Precio Actual</span>
                                        <input type="number" className="inv-price-input" defaultValue={inv.current_price?.toString() || ''} placeholder="Actualizar" title="Precio actual"
                                            onBlur={e => updatePrice(inv.id, e.target.value)} min="0" step="0.01" />
                                    </div>
                                </div>
                                <div className="inv-card-footer">
                                    <span className="inv-card-total">{fmt(currentVal, inv.currency)}</span>
                                    <span className={`inv-card-gain ${gain >= 0 ? 'positive' : 'negative'}`}>
                                        {gain >= 0 ? '+' : ''}{fmt(gain, inv.currency)} ({pct.toFixed(1)}%)
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <button type="button" className="fab-add" onClick={() => { resetForm(); setEditing(null); setIsModal(true); }}><Plus size={20} /> Inversión</button>

            {/* Modal */}
            {isModal && (
                <div className="modal-overlay" onClick={() => setIsModal(false)}>
                    <div className="inv-modal" onClick={e => e.stopPropagation()}>
                        <div className="inv-modal-header"><h2>{editing ? 'Editar' : 'Nueva Inversión'}</h2><button type="button" title="Cerrar" onClick={() => setIsModal(false)}><X size={18} /></button></div>
                        <form onSubmit={handleSubmit} className="inv-modal-form">
                            <div className="form-group"><label>Nombre</label><input type="text" className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Ej: Apple Inc" /></div>
                            <div className="form-row two-cols">
                                <div className="form-group"><label>Tipo</label><select className="form-select" title="Tipo" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as Investment['type'] })}>{TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                                <div className="form-group"><label>Símbolo</label><input type="text" className="form-input" value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value.toUpperCase() })} placeholder="Ej: AAPL" /></div>
                            </div>
                            <div className="form-row two-cols">
                                <div className="form-group"><label>Cantidad</label><input type="number" className="form-input" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} required min="0" step="0.000001" /></div>
                                <div className="form-group"><label>Precio Compra</label><input type="number" className="form-input" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: e.target.value })} required min="0" step="0.01" /></div>
                            </div>
                            <div className="form-row two-cols">
                                <div className="form-group"><label>Precio Actual</label><input type="number" className="form-input" value={form.current_price} onChange={e => setForm({ ...form, current_price: e.target.value })} min="0" step="0.01" placeholder="Opcional" /></div>
                                <div className="form-group"><label>Moneda</label><select className="form-select" title="Moneda" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}><option value="USD">USD</option><option value="COP">COP</option><option value="EUR">EUR</option></select></div>
                            </div>
                            <div className="form-group"><label>Color</label><div className="color-grid">{COLORS.map(c => <button key={c} type="button" title={c} className={`color-swatch ${form.color === c ? 'selected' : ''}`} style={{ backgroundColor: c }} onClick={() => setForm({ ...form, color: c })} />)}</div></div>
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={saving}>{saving ? 'Guardando...' : editing ? 'Guardar' : 'Crear'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {deleteConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="inv-modal delete-modal" onClick={e => e.stopPropagation()}>
                        <AlertTriangle size={40} color="#F59E0B" /><h2>¿Eliminar "{deleteConfirm.name}"?</h2>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}><button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setDeleteConfirm(null)}>Cancelar</button><button type="button" className="btn btn-danger" style={{ flex: 1 }} onClick={() => handleDelete(deleteConfirm)}>Eliminar</button></div>
                    </div>
                </div>
            )}
        </div>
    );
}
