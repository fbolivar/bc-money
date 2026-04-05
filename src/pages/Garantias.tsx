import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Plus, Edit2, Trash2, X, Search, AlertTriangle, Clock, CheckCircle,
    Smartphone, Tv, Car, Sofa, Shirt, Wrench, Package, ShieldCheck,
    type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Warranty } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import './Garantias.css';

const CATEGORIES: { value: Warranty['category']; label: string; icon: LucideIcon }[] = [
    { value: 'electronics', label: 'Electrónica', icon: Smartphone },
    { value: 'appliance', label: 'Electrodoméstico', icon: Tv },
    { value: 'vehicle', label: 'Vehículo', icon: Car },
    { value: 'furniture', label: 'Mueble', icon: Sofa },
    { value: 'clothing', label: 'Ropa', icon: Shirt },
    { value: 'tools', label: 'Herramienta', icon: Wrench },
    { value: 'other', label: 'Otro', icon: Package },
];

const CAT_LABELS = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));
const CAT_ICONS: Record<string, LucideIcon> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.icon]));
const COLORS = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#64748B'];

function getWarrantyStatus(endDate: string) {
    const days = differenceInDays(new Date(endDate), new Date());
    if (days < 0) return { label: 'Vencida', class: 'expired', days };
    if (days <= 30) return { label: `Vence en ${days} día${days !== 1 ? 's' : ''}`, class: 'expiring', days };
    if (days <= 90) return { label: `Vence en ${Math.ceil(days / 30)} mes${Math.ceil(days / 30) > 1 ? 'es' : ''}`, class: 'warning', days };
    return { label: `${Math.ceil(days / 30)} meses restantes`, class: 'active', days };
}

interface FormData {
    product_name: string; brand: string; model: string; serial_number: string;
    category: Warranty['category']; purchase_date: string; warranty_end_date: string;
    purchase_price: string; currency: string; store: string; color: string; notes: string;
}

const DEFAULT_FORM: FormData = {
    product_name: '', brand: '', model: '', serial_number: '', category: 'electronics',
    purchase_date: format(new Date(), 'yyyy-MM-dd'), warranty_end_date: '',
    purchase_price: '', currency: 'COP', store: '', color: '#3B82F6', notes: '',
};

export function Garantias() {
    const { user, profile } = useAuth();
    const [warranties, setWarranties] = useState<Warranty[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<Warranty | null>(null);
    const [editing, setEditing] = useState<Warranty | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCat, setFilterCat] = useState('all');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);

    const currency = profile?.currency || 'COP';

    const showToast = useCallback((msg: string, type: 'success' | 'error') => {
        setToast({ message: msg, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const fetchData = useCallback(async () => {
        if (!user) return;
        const { data } = await supabase.from('warranties').select('*').eq('user_id', user.id).order('warranty_end_date');
        setWarranties(data || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

    const filtered = useMemo(() => {
        let list = warranties;
        if (searchTerm) {
            const t = searchTerm.toLowerCase();
            list = list.filter(w => w.product_name.toLowerCase().includes(t) || (w.brand || '').toLowerCase().includes(t));
        }
        if (filterCat !== 'all') list = list.filter(w => w.category === filterCat);
        return list;
    }, [warranties, searchTerm, filterCat]);

    const activeWarranties = useMemo(() => filtered.filter(w => differenceInDays(new Date(w.warranty_end_date), new Date()) >= 0), [filtered]);
    const expiredWarranties = useMemo(() => filtered.filter(w => differenceInDays(new Date(w.warranty_end_date), new Date()) < 0), [filtered]);

    // Alerts: expiring within 30 days
    const alerts = useMemo(() => warranties.filter(w => {
        const days = differenceInDays(new Date(w.warranty_end_date), new Date());
        return days >= 0 && days <= 30;
    }), [warranties]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || saving) return;
        setSaving(true);
        try {
            const data = {
                user_id: user.id, product_name: formData.product_name,
                brand: formData.brand || null, model: formData.model || null,
                serial_number: formData.serial_number || null, category: formData.category,
                purchase_date: formData.purchase_date, warranty_end_date: formData.warranty_end_date,
                purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
                currency: formData.currency, store: formData.store || null,
                color: formData.color, notes: formData.notes || null,
            };
            if (editing) {
                await supabase.from('warranties').update(data).eq('id', editing.id);
                showToast('Garantía actualizada', 'success');
            } else {
                await supabase.from('warranties').insert(data);
                showToast('Garantía registrada', 'success');
            }
            setIsModalOpen(false);
            setEditing(null);
            setFormData({ ...DEFAULT_FORM, currency });
            fetchData();
        } catch { showToast('Error al guardar', 'error'); }
        finally { setSaving(false); }
    }

    async function handleDelete(w: Warranty) {
        try {
            await supabase.from('warranties').delete().eq('id', w.id);
            setDeleteConfirm(null);
            showToast('Garantía eliminada', 'success');
            fetchData();
        } catch { showToast('Error al eliminar', 'error'); setDeleteConfirm(null); }
    }

    function openEdit(w: Warranty) {
        setEditing(w);
        setFormData({
            product_name: w.product_name, brand: w.brand || '', model: w.model || '',
            serial_number: w.serial_number || '', category: w.category,
            purchase_date: w.purchase_date, warranty_end_date: w.warranty_end_date,
            purchase_price: w.purchase_price?.toString() || '', currency: w.currency,
            store: w.store || '', color: w.color, notes: w.notes || '',
        });
        setIsModalOpen(true);
    }

    if (loading) return <div className="loading-screen">Cargando...</div>;

    return (
        <div className="garantias-container">
            {toast && <div className={`gar-toast ${toast.type}`}>{toast.message}</div>}

            {/* Alerts */}
            {alerts.length > 0 && (
                <div className="warranty-alerts">
                    {alerts.map(w => {
                        const days = differenceInDays(new Date(w.warranty_end_date), new Date());
                        return (
                            <div key={w.id} className={`warranty-alert ${days <= 7 ? 'urgent' : ''}`}>
                                <Clock size={16} />
                                <span>
                                    <strong>{w.product_name}</strong> — garantía vence {days === 0 ? 'hoy' : `en ${days} día${days > 1 ? 's' : ''}`}
                                    {' '}({format(new Date(w.warranty_end_date), 'd MMM yyyy', { locale: es })})
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="garantias-header">
                <div>
                    <h1>Garantías</h1>
                    <p>Registro y seguimiento de garantías de tus productos</p>
                </div>
            </div>

            {/* Summary */}
            <div className="garantias-summary">
                <div className="gs-card">
                    <ShieldCheck size={20} />
                    <div><span className="gs-num">{activeWarranties.length}</span><span className="gs-label">Vigentes</span></div>
                </div>
                <div className="gs-card alert">
                    <Clock size={20} />
                    <div><span className="gs-num">{alerts.length}</span><span className="gs-label">Por vencer</span></div>
                </div>
                <div className="gs-card expired">
                    <AlertTriangle size={20} />
                    <div><span className="gs-num">{expiredWarranties.length}</span><span className="gs-label">Vencidas</span></div>
                </div>
            </div>

            {/* Filters */}
            <div className="garantias-filters">
                <div className="garantias-search">
                    <Search size={18} className="search-icon" />
                    <input type="text" placeholder="Buscar productos..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
                </div>
                <select className="filter-select" value={filterCat} onChange={e => setFilterCat(e.target.value)} title="Filtrar por categoría">
                    <option value="all">Todas las categorías</option>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
            </div>

            {/* Active Warranties */}
            {activeWarranties.length === 0 && expiredWarranties.length === 0 ? (
                <div className="garantias-empty">
                    <ShieldCheck size={48} />
                    <h3>{searchTerm || filterCat !== 'all' ? 'No se encontraron garantías' : 'No tienes garantías registradas'}</h3>
                    <p>Registra las garantías de tus productos para no perder cobertura</p>
                    {!searchTerm && filterCat === 'all' && (
                        <button type="button" className="empty-add-btn" onClick={() => { setFormData({ ...DEFAULT_FORM, currency }); setEditing(null); setIsModalOpen(true); }}>
                            <Plus size={20} /> Agregar Garantía
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {activeWarranties.length > 0 && (
                        <div className="warranties-section">
                            <h3>Garantías Vigentes ({activeWarranties.length})</h3>
                            <div className="warranties-grid">
                                {activeWarranties.map(w => <WarrantyCard key={w.id} warranty={w} onEdit={openEdit} onDelete={setDeleteConfirm} currency={currency} />)}
                            </div>
                        </div>
                    )}
                    {expiredWarranties.length > 0 && (
                        <div className="warranties-section expired-section">
                            <h3>Garantías Vencidas ({expiredWarranties.length})</h3>
                            <div className="warranties-grid">
                                {expiredWarranties.map(w => <WarrantyCard key={w.id} warranty={w} onEdit={openEdit} onDelete={setDeleteConfirm} currency={currency} />)}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* FAB */}
            <button type="button" className="fab-add" onClick={() => { setFormData({ ...DEFAULT_FORM, currency }); setEditing(null); setIsModalOpen(true); }}>
                <Plus size={20} /> Agregar
            </button>

            {/* Modal Crear/Editar */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editing ? 'Editar Garantía' : 'Nueva Garantía'}</h2>
                            <button type="button" className="close-btn" title="Cerrar" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-form">
                            <div className="form-group">
                                <label>Producto</label>
                                <input type="text" className="form-input" value={formData.product_name} onChange={e => setFormData({ ...formData, product_name: e.target.value })} required placeholder="Ej: iPhone 15 Pro" />
                            </div>
                            <div className="form-row two-cols">
                                <div className="form-group">
                                    <label>Marca</label>
                                    <input type="text" className="form-input" value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })} placeholder="Ej: Apple" />
                                </div>
                                <div className="form-group">
                                    <label>Modelo</label>
                                    <input type="text" className="form-input" value={formData.model} onChange={e => setFormData({ ...formData, model: e.target.value })} placeholder="Ej: A2848" />
                                </div>
                            </div>
                            <div className="form-row two-cols">
                                <div className="form-group">
                                    <label>Categoría</label>
                                    <select className="form-select" title="Categoría" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value as Warranty['category'] })}>
                                        {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Tienda</label>
                                    <input type="text" className="form-input" value={formData.store} onChange={e => setFormData({ ...formData, store: e.target.value })} placeholder="Ej: Alkosto" />
                                </div>
                            </div>
                            <div className="form-row two-cols">
                                <div className="form-group">
                                    <label>Fecha de Compra</label>
                                    <input type="date" className="form-input" value={formData.purchase_date} onChange={e => setFormData({ ...formData, purchase_date: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label>Fecha Fin Garantía</label>
                                    <input type="date" className="form-input" value={formData.warranty_end_date} onChange={e => setFormData({ ...formData, warranty_end_date: e.target.value })} required />
                                </div>
                            </div>
                            <div className="form-row two-cols">
                                <div className="form-group">
                                    <label>Precio de Compra</label>
                                    <input type="number" className="form-input" value={formData.purchase_price} onChange={e => setFormData({ ...formData, purchase_price: e.target.value })} min="0" step="0.01" placeholder="Opcional" />
                                </div>
                                <div className="form-group">
                                    <label>N° Serie</label>
                                    <input type="text" className="form-input" value={formData.serial_number} onChange={e => setFormData({ ...formData, serial_number: e.target.value })} placeholder="Opcional" />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Color</label>
                                <div className="color-grid">
                                    {COLORS.map(c => <button key={c} type="button" title={c} className={`color-swatch ${formData.color === c ? 'selected' : ''}`} style={{ backgroundColor: c }} onClick={() => setFormData({ ...formData, color: c })} />)}
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Notas</label>
                                <input type="text" className="form-input" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Observaciones (opcional)" />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-submit" disabled={saving}>{saving ? 'Guardando...' : editing ? 'Guardar' : 'Crear'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Eliminar */}
            {deleteConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="modal-content delete-modal" onClick={e => e.stopPropagation()}>
                        <AlertTriangle size={40} color="#F59E0B" />
                        <h2>¿Eliminar "{deleteConfirm.product_name}"?</h2>
                        <p>Se eliminará el registro de garantía.</p>
                        <div className="modal-actions">
                            <button type="button" className="btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                            <button type="button" className="btn-delete" onClick={() => handleDelete(deleteConfirm)}>Eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function WarrantyCard({ warranty: w, onEdit, onDelete, currency }: {
    warranty: Warranty; onEdit: (w: Warranty) => void; onDelete: (w: Warranty) => void; currency: string;
}) {
    const Icon = CAT_ICONS[w.category] || Package;
    const status = getWarrantyStatus(w.warranty_end_date);
    const totalDays = differenceInDays(new Date(w.warranty_end_date), new Date(w.purchase_date));
    const elapsed = differenceInDays(new Date(), new Date(w.purchase_date));
    const progress = totalDays > 0 ? Math.min(Math.max(elapsed / totalDays * 100, 0), 100) : 100;

    return (
        <div className={`warranty-card wc-${status.class}`}>
            <div className="wc-header">
                <div className="wc-icon" style={{ backgroundColor: `${w.color}20`, color: w.color }}>
                    <Icon size={22} />
                </div>
                <div className="wc-actions">
                    <button type="button" title="Editar" className="wc-btn" onClick={() => onEdit(w)}><Edit2 size={14} /></button>
                    <button type="button" title="Eliminar" className="wc-btn del" onClick={() => onDelete(w)}><Trash2 size={14} /></button>
                </div>
            </div>
            <h3 className="wc-name">{w.product_name}</h3>
            <span className="wc-meta">{w.brand}{w.model ? ` — ${w.model}` : ''}</span>
            <span className="wc-cat">{CAT_LABELS[w.category]}{w.store ? ` · ${w.store}` : ''}</span>

            <div className="wc-dates">
                <span>Compra: {format(new Date(w.purchase_date), 'd MMM yyyy', { locale: es })}</span>
                <span>Vence: {format(new Date(w.warranty_end_date), 'd MMM yyyy', { locale: es })}</span>
            </div>

            <div className="wc-progress">
                <div className="wc-progress-bar" style={{ width: `${progress}%`, backgroundColor: status.class === 'expired' ? '#EF4444' : status.class === 'expiring' ? '#F59E0B' : w.color }}></div>
            </div>

            <div className="wc-footer">
                <span className={`wc-status ${status.class}`}>
                    {status.class === 'expired' ? <AlertTriangle size={13} /> : status.class === 'expiring' ? <Clock size={13} /> : <CheckCircle size={13} />}
                    {status.label}
                </span>
                {w.purchase_price && (
                    <span className="wc-price">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: w.currency || currency, minimumFractionDigits: 0 }).format(w.purchase_price)}</span>
                )}
            </div>
        </div>
    );
}
