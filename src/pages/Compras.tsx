import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Plus, Trash2, X, Check, ShoppingCart, AlertTriangle, ChevronDown, ChevronUp,
    Archive, CheckCircle2, Circle, ArrowUp, Minus, Equal,
    Apple, SprayCanIcon, User, Pill, Smartphone, Shirt, Home, PawPrint, Package,
    type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ShoppingList, ShoppingItem } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import './Compras.css';

const ITEM_CATS: { value: ShoppingItem['category']; label: string; icon: LucideIcon }[] = [
    { value: 'food', label: 'Alimentos', icon: Apple },
    { value: 'cleaning', label: 'Limpieza', icon: SprayCanIcon },
    { value: 'personal', label: 'Personal', icon: User },
    { value: 'pharmacy', label: 'Farmacia', icon: Pill },
    { value: 'electronics', label: 'Electrónica', icon: Smartphone },
    { value: 'clothing', label: 'Ropa', icon: Shirt },
    { value: 'home', label: 'Hogar', icon: Home },
    { value: 'pets', label: 'Mascotas', icon: PawPrint },
    { value: 'other', label: 'Otro', icon: Package },
];
const CAT_LABELS = Object.fromEntries(ITEM_CATS.map(c => [c.value, c.label]));
const CAT_ICONS: Record<string, LucideIcon> = Object.fromEntries(ITEM_CATS.map(c => [c.value, c.icon]));

const PRIORITY_ICONS: Record<string, LucideIcon> = { high: ArrowUp, normal: Equal, low: Minus };
const PRIORITY_LABELS: Record<string, string> = { high: 'Alta', normal: 'Normal', low: 'Baja' };

function fmt(n: number, c: string) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: c, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n); }

export function Compras() {
    const { user, profile } = useAuth();
    const [lists, setLists] = useState<ShoppingList[]>([]);
    const [items, setItems] = useState<ShoppingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedList, setExpandedList] = useState<string | null>(null);
    const [isListModal, setIsListModal] = useState(false);
    const [isItemModal, setIsItemModal] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'list' | 'item'; id: string; name: string } | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [showArchived, setShowArchived] = useState(false);

    const currency = profile?.currency || 'COP';

    const [listForm, setListForm] = useState({ name: '', budget_limit: '' });
    const [itemForm, setItemForm] = useState({ list_id: '', name: '', category: 'food' as ShoppingItem['category'], quantity: '1', unit: 'und', estimated_price: '', priority: 'normal' as ShoppingItem['priority'], notes: '' });

    const showToast = useCallback((msg: string, type: 'success' | 'error') => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 3000); }, []);

    const fetchData = useCallback(async () => {
        if (!user) return;
        const [lRes, iRes] = await Promise.all([
            supabase.from('shopping_lists').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
            supabase.from('shopping_items').select('*').eq('user_id', user.id).order('is_checked').order('priority', { ascending: true }).order('created_at'),
        ]);
        setLists(lRes.data || []);
        setItems(iRes.data || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

    const activeLists = useMemo(() => lists.filter(l => l.status === 'active'), [lists]);
    const archivedLists = useMemo(() => lists.filter(l => l.status !== 'active'), [lists]);

    function getListItems(listId: string) { return items.filter(i => i.list_id === listId); }

    function getListStats(listId: string) {
        const li = getListItems(listId);
        const total = li.length;
        const checked = li.filter(i => i.is_checked).length;
        const estimated = li.reduce((s, i) => s + (i.estimated_price || 0) * i.quantity, 0);
        const actual = li.filter(i => i.is_checked).reduce((s, i) => s + (i.actual_price || i.estimated_price || 0) * i.quantity, 0);
        return { total, checked, estimated, actual, progress: total > 0 ? (checked / total) * 100 : 0 };
    }

    // List CRUD
    async function handleListSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user) return;
        await supabase.from('shopping_lists').insert({ user_id: user.id, name: listForm.name, budget_limit: listForm.budget_limit ? parseFloat(listForm.budget_limit) : null, currency });
        setIsListModal(false); setListForm({ name: '', budget_limit: '' });
        showToast('Lista creada', 'success'); fetchData();
    }

    async function archiveList(id: string) {
        await supabase.from('shopping_lists').update({ status: 'archived' }).eq('id', id);
        showToast('Lista archivada', 'success'); fetchData();
    }

    async function completeList(id: string) {
        await supabase.from('shopping_lists').update({ status: 'completed' }).eq('id', id);
        showToast('Lista completada', 'success'); fetchData();
    }

    // Item CRUD
    async function handleItemSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user) return;
        await supabase.from('shopping_items').insert({
            list_id: itemForm.list_id, user_id: user.id, name: itemForm.name,
            category: itemForm.category, quantity: parseFloat(itemForm.quantity) || 1,
            unit: itemForm.unit || 'und', estimated_price: itemForm.estimated_price ? parseFloat(itemForm.estimated_price) : null,
            priority: itemForm.priority, notes: itemForm.notes || null,
        });
        setIsItemModal(false);
        setItemForm({ list_id: itemForm.list_id, name: '', category: 'food', quantity: '1', unit: 'und', estimated_price: '', priority: 'normal', notes: '' });
        showToast('Producto agregado', 'success'); fetchData();
    }

    async function toggleItem(item: ShoppingItem) {
        await supabase.from('shopping_items').update({ is_checked: !item.is_checked }).eq('id', item.id);
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_checked: !i.is_checked } : i));
    }

    async function updateActualPrice(itemId: string, price: string) {
        await supabase.from('shopping_items').update({ actual_price: price ? parseFloat(price) : null }).eq('id', itemId);
    }

    async function handleDelete() {
        if (!deleteConfirm) return;
        if (deleteConfirm.type === 'list') await supabase.from('shopping_lists').delete().eq('id', deleteConfirm.id);
        else await supabase.from('shopping_items').delete().eq('id', deleteConfirm.id);
        setDeleteConfirm(null); showToast('Eliminado', 'success'); fetchData();
    }

    function openAddItem(listId: string) {
        setItemForm({ list_id: listId, name: '', category: 'food', quantity: '1', unit: 'und', estimated_price: '', priority: 'normal', notes: '' });
        setIsItemModal(true);
    }

    if (loading) return <div className="loading-screen">Cargando...</div>;

    return (
        <div className="compras-container">
            {toast && <div className={`shop-toast ${toast.type}`}>{toast.message}</div>}

            <div className="compras-header">
                <div><h1>Lista de Compras</h1><p>Organiza tus compras con presupuesto y prioridades</p></div>
            </div>

            {/* Active Lists */}
            {activeLists.length === 0 ? (
                <div className="compras-empty">
                    <ShoppingCart size={48} />
                    <h3>No tienes listas de compras</h3>
                    <p>Crea tu primera lista para organizar tus compras</p>
                    <button type="button" className="empty-add-btn" onClick={() => setIsListModal(true)}><Plus size={20} /> Nueva Lista</button>
                </div>
            ) : (
                <div className="lists-container">
                    {activeLists.map(list => {
                        const stats = getListStats(list.id);
                        const listItems = getListItems(list.id);
                        const isExpanded = expandedList === list.id;
                        const overBudget = list.budget_limit && stats.actual > list.budget_limit;

                        // Group items by category
                        const grouped = listItems.reduce((acc: Record<string, ShoppingItem[]>, item) => {
                            (acc[item.category] = acc[item.category] || []).push(item);
                            return acc;
                        }, {});

                        return (
                            <div key={list.id} className={`list-card ${overBudget ? 'over-budget' : ''}`}>
                                <div className="list-card-header" onClick={() => setExpandedList(isExpanded ? null : list.id)}>
                                    <div className="list-info">
                                        <h3>{list.name}</h3>
                                        <span className="list-meta">
                                            {stats.checked}/{stats.total} productos ·
                                            {list.budget_limit ? ` ${fmt(stats.actual, currency)} de ${fmt(list.budget_limit, currency)}` : ` ${fmt(stats.estimated, currency)} estimado`}
                                        </span>
                                        {stats.total > 0 && (
                                            <div className="list-progress">
                                                <div className="list-progress-bar" style={{ width: `${stats.progress}%` }}></div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="list-actions">
                                        <button type="button" title="Agregar producto" className="la-btn add" onClick={e => { e.stopPropagation(); openAddItem(list.id); }}><Plus size={16} /></button>
                                        <button type="button" title="Completar" className="la-btn done" onClick={e => { e.stopPropagation(); completeList(list.id); }}><Check size={16} /></button>
                                        <button type="button" title="Archivar" className="la-btn" onClick={e => { e.stopPropagation(); archiveList(list.id); }}><Archive size={16} /></button>
                                        <button type="button" title="Eliminar" className="la-btn del" onClick={e => { e.stopPropagation(); setDeleteConfirm({ type: 'list', id: list.id, name: list.name }); }}><Trash2 size={16} /></button>
                                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </div>
                                </div>

                                {overBudget && (
                                    <div className="budget-warning"><AlertTriangle size={14} /> Presupuesto excedido por {fmt(stats.actual - (list.budget_limit || 0), currency)}</div>
                                )}

                                {isExpanded && (
                                    <div className="list-items">
                                        {listItems.length === 0 ? (
                                            <p className="no-items">Lista vacía — agrega productos</p>
                                        ) : Object.entries(grouped).map(([cat, catItems]) => {
                                            const CatIcon = CAT_ICONS[cat] || Package;
                                            return (
                                                <div key={cat} className="item-group">
                                                    <div className="item-group-header"><CatIcon size={14} /><span>{CAT_LABELS[cat]}</span></div>
                                                    {catItems.map(item => {
                                                        const PIcon = PRIORITY_ICONS[item.priority];
                                                        return (
                                                            <div key={item.id} className={`shop-item ${item.is_checked ? 'checked' : ''} pri-${item.priority}`}>
                                                                <button type="button" className="check-btn" title="Marcar" onClick={() => toggleItem(item)}>
                                                                    {item.is_checked ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                                                                </button>
                                                                <div className="item-info">
                                                                    <span className="item-name">{item.name}</span>
                                                                    <span className="item-qty">{item.quantity} {item.unit}</span>
                                                                </div>
                                                                <PIcon size={14} className={`pri-icon pri-${item.priority}`} />
                                                                <div className="item-prices">
                                                                    {item.estimated_price && <span className="est-price">{fmt(item.estimated_price * item.quantity, currency)}</span>}
                                                                    {item.is_checked && (
                                                                        <input type="number" className="actual-input" placeholder="Real" defaultValue={item.actual_price?.toString() || ''} onBlur={e => updateActualPrice(item.id, e.target.value)} min="0" step="0.01" />
                                                                    )}
                                                                </div>
                                                                <button type="button" title="Eliminar" className="la-btn del sm" onClick={() => setDeleteConfirm({ type: 'item', id: item.id, name: item.name })}><Trash2 size={13} /></button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Archived */}
            {archivedLists.length > 0 && (
                <div className="archived-section">
                    <button type="button" className="toggle-archived" onClick={() => setShowArchived(!showArchived)}>
                        {showArchived ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        Listas anteriores ({archivedLists.length})
                    </button>
                    {showArchived && archivedLists.map(list => {
                        const stats = getListStats(list.id);
                        return (
                            <div key={list.id} className="archived-item">
                                <span className={`arch-status ${list.status}`}>{list.status === 'completed' ? <CheckCircle2 size={14} /> : <Archive size={14} />}</span>
                                <span className="arch-name">{list.name}</span>
                                <span className="arch-date">{format(new Date(list.created_at), 'd MMM', { locale: es })}</span>
                                <span className="arch-total">{fmt(stats.actual || stats.estimated, currency)}</span>
                                <button type="button" title="Eliminar" className="la-btn del sm" onClick={() => setDeleteConfirm({ type: 'list', id: list.id, name: list.name })}><Trash2 size={13} /></button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* FAB */}
            <button type="button" className="fab-add" onClick={() => { setListForm({ name: '', budget_limit: '' }); setIsListModal(true); }}>
                <Plus size={20} /> Nueva Lista
            </button>

            {/* Modal New List */}
            {isListModal && (
                <div className="modal-overlay" onClick={() => setIsListModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h2>Nueva Lista</h2><button type="button" className="close-btn" title="Cerrar" onClick={() => setIsListModal(false)}><X size={20} /></button></div>
                        <form onSubmit={handleListSubmit} className="modal-form">
                            <div className="form-group"><label>Nombre</label><input type="text" className="form-input" value={listForm.name} onChange={e => setListForm({ ...listForm, name: e.target.value })} required placeholder="Ej: Supermercado semanal" /></div>
                            <div className="form-group"><label>Presupuesto máximo (opcional)</label><input type="number" className="form-input" value={listForm.budget_limit} onChange={e => setListForm({ ...listForm, budget_limit: e.target.value })} min="0" step="0.01" placeholder={`Ej: 200000`} /></div>
                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsListModal(false)}>Cancelar</button>
                                <button type="submit" className="btn-submit">Crear Lista</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Add Item */}
            {isItemModal && (
                <div className="modal-overlay" onClick={() => setIsItemModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h2>Agregar Producto</h2><button type="button" className="close-btn" title="Cerrar" onClick={() => setIsItemModal(false)}><X size={20} /></button></div>
                        <form onSubmit={handleItemSubmit} className="modal-form">
                            <div className="form-group"><label>Producto</label><input type="text" className="form-input" value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} required placeholder="Ej: Leche" autoFocus /></div>
                            <div className="form-row two-cols">
                                <div className="form-group"><label>Categoría</label><select className="form-select" title="Categoría" value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value as ShoppingItem['category'] })}>{ITEM_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                                <div className="form-group"><label>Prioridad</label><select className="form-select" title="Prioridad" value={itemForm.priority} onChange={e => setItemForm({ ...itemForm, priority: e.target.value as ShoppingItem['priority'] })}><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baja</option></select></div>
                            </div>
                            <div className="form-row three-cols">
                                <div className="form-group"><label>Cantidad</label><input type="number" className="form-input" value={itemForm.quantity} onChange={e => setItemForm({ ...itemForm, quantity: e.target.value })} min="0.1" step="0.1" /></div>
                                <div className="form-group"><label>Unidad</label><select className="form-select" title="Unidad" value={itemForm.unit} onChange={e => setItemForm({ ...itemForm, unit: e.target.value })}><option value="und">und</option><option value="kg">kg</option><option value="lb">lb</option><option value="lt">lt</option><option value="ml">ml</option><option value="gr">gr</option><option value="paq">paq</option></select></div>
                                <div className="form-group"><label>Precio est.</label><input type="number" className="form-input" value={itemForm.estimated_price} onChange={e => setItemForm({ ...itemForm, estimated_price: e.target.value })} min="0" step="0.01" /></div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsItemModal(false)}>Cancelar</button>
                                <button type="submit" className="btn-submit">Agregar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Delete */}
            {deleteConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="modal-content delete-modal" onClick={e => e.stopPropagation()}>
                        <AlertTriangle size={40} color="#F59E0B" />
                        <h2>¿Eliminar "{deleteConfirm.name}"?</h2>
                        <div className="modal-actions">
                            <button type="button" className="btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                            <button type="button" className="btn-delete" onClick={handleDelete}>Eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
