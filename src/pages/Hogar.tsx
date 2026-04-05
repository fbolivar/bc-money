import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Plus, Edit2, Trash2, X, Search, AlertTriangle, Clock, ChevronDown, ChevronUp, CheckCircle,
    CookingPot, Bath, Bed, Sofa, Car, TreePine, WashingMachine, Home, Wrench,
    Paintbrush, Droplets, Zap, Eye, Hammer, Package, Replace, Settings,
    type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { HomeItem, HomeMaintenance } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import './Hogar.css';

const AREAS: { value: HomeItem['area']; label: string; icon: LucideIcon }[] = [
    { value: 'kitchen', label: 'Cocina', icon: CookingPot },
    { value: 'bathroom', label: 'Baño', icon: Bath },
    { value: 'bedroom', label: 'Habitación', icon: Bed },
    { value: 'living', label: 'Sala', icon: Sofa },
    { value: 'garage', label: 'Garaje', icon: Car },
    { value: 'garden', label: 'Jardín', icon: TreePine },
    { value: 'laundry', label: 'Lavandería', icon: WashingMachine },
    { value: 'exterior', label: 'Exterior', icon: Home },
    { value: 'general', label: 'General', icon: Settings },
];
const AREA_LABELS = Object.fromEntries(AREAS.map(a => [a.value, a.label]));
const AREA_ICONS: Record<string, LucideIcon> = Object.fromEntries(AREAS.map(a => [a.value, a.icon]));

const MAINT_TYPES: { value: HomeMaintenance['type']; label: string; icon: LucideIcon }[] = [
    { value: 'repair', label: 'Reparación', icon: Wrench },
    { value: 'cleaning', label: 'Limpieza', icon: Droplets },
    { value: 'inspection', label: 'Inspección', icon: Eye },
    { value: 'replacement', label: 'Reemplazo', icon: Replace },
    { value: 'installation', label: 'Instalación', icon: Hammer },
    { value: 'painting', label: 'Pintura', icon: Paintbrush },
    { value: 'plumbing', label: 'Plomería', icon: Droplets },
    { value: 'electrical', label: 'Eléctrico', icon: Zap },
    { value: 'other', label: 'Otro', icon: Package },
];
const MT_LABELS = Object.fromEntries(MAINT_TYPES.map(m => [m.value, m.label]));
const MT_ICONS: Record<string, LucideIcon> = Object.fromEntries(MAINT_TYPES.map(m => [m.value, m.icon]));

const COLORS = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#64748B'];

function fmt(n: number, c: string) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: c, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n); }

export function Hogar() {
    const { user, profile } = useAuth();
    const [items, setItems] = useState<HomeItem[]>([]);
    const [tasks, setTasks] = useState<HomeMaintenance[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isItemModal, setIsItemModal] = useState(false);
    const [isTaskModal, setIsTaskModal] = useState(false);
    const [editingItem, setEditingItem] = useState<HomeItem | null>(null);
    const [editingTask, setEditingTask] = useState<HomeMaintenance | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'item' | 'task'; item: HomeItem | HomeMaintenance } | null>(null);
    const [expandedItem, setExpandedItem] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [areaFilter, setAreaFilter] = useState('all');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const currency = profile?.currency || 'COP';

    const [itemForm, setItemForm] = useState({ name: '', area: 'general' as HomeItem['area'], brand: '', model: '', install_date: '', color: '#06B6D4', notes: '' });
    const [taskForm, setTaskForm] = useState({ item_id: '', type: 'repair' as HomeMaintenance['type'], name: '', date: format(new Date(), 'yyyy-MM-dd'), next_date: '', cost: '', provider: '', status: 'completed' as HomeMaintenance['status'], notes: '' });

    const showToast = useCallback((msg: string, type: 'success' | 'error') => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 3000); }, []);

    const fetchData = useCallback(async () => {
        if (!user) return;
        const [iRes, tRes] = await Promise.all([
            supabase.from('home_items').select('*').eq('user_id', user.id).order('name'),
            supabase.from('home_maintenance').select('*').eq('user_id', user.id).order('date', { ascending: false }),
        ]);
        setItems(iRes.data || []);
        setTasks(tRes.data || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

    const filtered = useMemo(() => {
        let list = items;
        if (searchTerm) { const t = searchTerm.toLowerCase(); list = list.filter(i => i.name.toLowerCase().includes(t) || (i.brand || '').toLowerCase().includes(t)); }
        if (areaFilter !== 'all') list = list.filter(i => i.area === areaFilter);
        return list;
    }, [items, searchTerm, areaFilter]);

    const alerts = useMemo(() => tasks.filter(t => {
        if (!t.next_date || t.status === 'cancelled') return false;
        const days = differenceInDays(new Date(t.next_date), new Date());
        return days >= 0 && days <= 14;
    }), [tasks]);

    const scheduled = useMemo(() => tasks.filter(t => t.status === 'scheduled'), [tasks]);
    const totalSpent = useMemo(() => tasks.filter(t => t.status === 'completed').reduce((s, t) => s + (t.cost || 0), 0), [tasks]);

    async function handleItemSubmit(e: React.FormEvent) {
        e.preventDefault(); if (!user || saving) return; setSaving(true);
        try {
            const data = { user_id: user.id, name: itemForm.name, area: itemForm.area, brand: itemForm.brand || null, model: itemForm.model || null, install_date: itemForm.install_date || null, color: itemForm.color, notes: itemForm.notes || null };
            if (editingItem) { await supabase.from('home_items').update(data).eq('id', editingItem.id); showToast('Elemento actualizado', 'success'); }
            else { await supabase.from('home_items').insert(data); showToast('Elemento registrado', 'success'); }
            setIsItemModal(false); setEditingItem(null); setItemForm({ name: '', area: 'general', brand: '', model: '', install_date: '', color: '#06B6D4', notes: '' }); fetchData();
        } catch { showToast('Error al guardar', 'error'); } finally { setSaving(false); }
    }

    async function handleTaskSubmit(e: React.FormEvent) {
        e.preventDefault(); if (!user || saving) return; setSaving(true);
        try {
            const data = { item_id: taskForm.item_id || null, user_id: user.id, type: taskForm.type, name: taskForm.name, date: taskForm.date, next_date: taskForm.next_date || null, cost: taskForm.cost ? parseFloat(taskForm.cost) : null, currency, provider: taskForm.provider || null, status: taskForm.status, notes: taskForm.notes || null };
            if (editingTask) { await supabase.from('home_maintenance').update(data).eq('id', editingTask.id); showToast('Tarea actualizada', 'success'); }
            else { await supabase.from('home_maintenance').insert(data); showToast('Tarea registrada', 'success'); }
            setIsTaskModal(false); setEditingTask(null); setTaskForm({ item_id: '', type: 'repair', name: '', date: format(new Date(), 'yyyy-MM-dd'), next_date: '', cost: '', provider: '', status: 'completed', notes: '' }); fetchData();
        } catch { showToast('Error al guardar', 'error'); } finally { setSaving(false); }
    }

    async function handleDelete() {
        if (!deleteConfirm) return;
        try {
            if (deleteConfirm.type === 'item') await supabase.from('home_items').delete().eq('id', deleteConfirm.item.id);
            else await supabase.from('home_maintenance').delete().eq('id', deleteConfirm.item.id);
            setDeleteConfirm(null); showToast('Eliminado', 'success'); fetchData();
        } catch { showToast('Error', 'error'); setDeleteConfirm(null); }
    }

    function openEditItem(i: HomeItem) { setEditingItem(i); setItemForm({ name: i.name, area: i.area, brand: i.brand || '', model: i.model || '', install_date: i.install_date || '', color: i.color, notes: i.notes || '' }); setIsItemModal(true); }
    function openEditTask(t: HomeMaintenance) { setEditingTask(t); setTaskForm({ item_id: t.item_id || '', type: t.type, name: t.name, date: t.date, next_date: t.next_date || '', cost: t.cost?.toString() || '', provider: t.provider || '', status: t.status, notes: t.notes || '' }); setIsTaskModal(true); }
    function openNewTask(itemId: string) { setEditingTask(null); setTaskForm({ item_id: itemId, type: 'repair', name: '', date: format(new Date(), 'yyyy-MM-dd'), next_date: '', cost: '', provider: '', status: 'completed', notes: '' }); setIsTaskModal(true); }

    if (loading) return <div className="loading-screen">Cargando...</div>;

    return (
        <div className="hogar-container">
            {toast && <div className={`hog-toast ${toast.type}`}>{toast.message}</div>}

            {alerts.length > 0 && (
                <div className="hog-alerts">
                    {alerts.map(t => {
                        const item = items.find(i => i.id === t.item_id);
                        const days = differenceInDays(new Date(t.next_date!), new Date());
                        return (
                            <div key={t.id} className={`hog-alert ${days <= 3 ? 'urgent' : ''}`}>
                                <Clock size={16} />
                                <span><strong>{t.name}</strong>{item ? ` (${item.name})` : ''} — {days === 0 ? 'hoy' : `en ${days} día${days > 1 ? 's' : ''}`}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="hogar-header"><div><h1>Mantenimiento del Hogar</h1><p>Registro de reparaciones, inspecciones y mantenimiento</p></div></div>

            <div className="hogar-summary">
                <div className="hs-card"><span className="hs-num">{items.length}</span><span className="hs-label">Elementos</span></div>
                <div className="hs-card"><span className="hs-num">{tasks.filter(t => t.status === 'completed').length}</span><span className="hs-label">Completados</span></div>
                <div className="hs-card"><span className="hs-num">{scheduled.length}</span><span className="hs-label">Pendientes</span></div>
                <div className="hs-card total"><span className="hs-num">{fmt(totalSpent, currency)}</span><span className="hs-label">Invertido</span></div>
            </div>

            <div className="hogar-filters">
                <div className="hogar-search"><Search size={18} className="search-icon" /><input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" /></div>
                <select className="filter-select" value={areaFilter} onChange={e => setAreaFilter(e.target.value)} title="Filtrar por área"><option value="all">Todas las áreas</option>{AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</select>
                <button type="button" className="add-task-btn" onClick={() => { setEditingTask(null); setTaskForm({ item_id: '', type: 'repair', name: '', date: format(new Date(), 'yyyy-MM-dd'), next_date: '', cost: '', provider: '', status: 'scheduled', notes: '' }); setIsTaskModal(true); }}><Plus size={16} /> Tarea</button>
            </div>

            {filtered.length === 0 ? (
                <div className="hogar-empty"><Home size={48} /><h3>No tienes elementos registrados</h3><p>Agrega electrodomésticos, sistemas o áreas de tu hogar</p>
                    <button type="button" className="empty-add-btn" onClick={() => { setEditingItem(null); setIsItemModal(true); }}><Plus size={20} /> Agregar Elemento</button></div>
            ) : (
                <div className="home-items-list">
                    {filtered.map(item => {
                        const Icon = AREA_ICONS[item.area] || Home;
                        const itemTasks = tasks.filter(t => t.item_id === item.id);
                        const itemCost = itemTasks.filter(t => t.status === 'completed').reduce((s, t) => s + (t.cost || 0), 0);
                        const isExpanded = expandedItem === item.id;

                        return (
                            <div key={item.id} className="hi-card">
                                <div className="hi-main" onClick={() => setExpandedItem(isExpanded ? null : item.id)}>
                                    <div className="hi-icon" style={{ backgroundColor: `${item.color}20`, color: item.color }}><Icon size={24} /></div>
                                    <div className="hi-info">
                                        <h3>{item.name}</h3>
                                        <span className="hi-meta">{AREA_LABELS[item.area]}{item.brand ? ` · ${item.brand}` : ''}{item.model ? ` · ${item.model}` : ''}</span>
                                    </div>
                                    <span className="hi-cost">{fmt(itemCost, currency)}</span>
                                    <div className="hi-actions">
                                        <button type="button" title="Agregar tarea" className="hi-btn add" onClick={e => { e.stopPropagation(); openNewTask(item.id); }}><Plus size={14} /></button>
                                        <button type="button" title="Editar" className="hi-btn" onClick={e => { e.stopPropagation(); openEditItem(item); }}><Edit2 size={14} /></button>
                                        <button type="button" title="Eliminar" className="hi-btn del" onClick={e => { e.stopPropagation(); setDeleteConfirm({ type: 'item', item }); }}><Trash2 size={14} /></button>
                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div className="hi-tasks">
                                        {itemTasks.length === 0 ? <p className="no-tasks">Sin tareas registradas</p> : itemTasks.map(t => {
                                            const TIcon = MT_ICONS[t.type] || Wrench;
                                            return (
                                                <div key={t.id} className={`task-row status-${t.status}`}>
                                                    <TIcon size={15} className="task-icon" />
                                                    <div className="task-info">
                                                        <span className="task-name">{t.name}</span>
                                                        <span className="task-meta">{MT_LABELS[t.type]} · {format(new Date(t.date), 'd MMM yyyy', { locale: es })}{t.provider ? ` · ${t.provider}` : ''}</span>
                                                        {t.next_date && <span className="task-next">Próximo: {format(new Date(t.next_date), 'd MMM yyyy', { locale: es })}</span>}
                                                    </div>
                                                    <span className={`task-status-badge ${t.status}`}>{t.status === 'completed' ? <CheckCircle size={12} /> : <Clock size={12} />}{t.status === 'completed' ? 'Hecho' : t.status === 'scheduled' ? 'Pendiente' : 'Cancelado'}</span>
                                                    {t.cost && <span className="task-cost">{fmt(t.cost, t.currency)}</span>}
                                                    <div className="task-actions">
                                                        <button type="button" title="Editar" className="hi-btn" onClick={() => openEditTask(t)}><Edit2 size={12} /></button>
                                                        <button type="button" title="Eliminar" className="hi-btn del" onClick={() => setDeleteConfirm({ type: 'task', item: t })}><Trash2 size={12} /></button>
                                                    </div>
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

            <button type="button" className="fab-add" onClick={() => { setEditingItem(null); setItemForm({ name: '', area: 'general', brand: '', model: '', install_date: '', color: '#06B6D4', notes: '' }); setIsItemModal(true); }}><Plus size={20} /> Elemento</button>

            {/* Modal Item */}
            {isItemModal && (
                <div className="modal-overlay" onClick={() => setIsItemModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h2>{editingItem ? 'Editar Elemento' : 'Nuevo Elemento'}</h2><button type="button" className="close-btn" title="Cerrar" onClick={() => setIsItemModal(false)}><X size={20} /></button></div>
                        <form onSubmit={handleItemSubmit} className="modal-form">
                            <div className="form-group"><label>Nombre</label><input type="text" className="form-input" value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} required placeholder="Ej: Calentador de agua" /></div>
                            <div className="form-row two-cols">
                                <div className="form-group"><label>Área</label><select className="form-select" title="Área" value={itemForm.area} onChange={e => setItemForm({ ...itemForm, area: e.target.value as HomeItem['area'] })}>{AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</select></div>
                                <div className="form-group"><label>Marca</label><input type="text" className="form-input" value={itemForm.brand} onChange={e => setItemForm({ ...itemForm, brand: e.target.value })} placeholder="Ej: Haceb" /></div>
                            </div>
                            <div className="form-row two-cols">
                                <div className="form-group"><label>Modelo</label><input type="text" className="form-input" value={itemForm.model} onChange={e => setItemForm({ ...itemForm, model: e.target.value })} /></div>
                                <div className="form-group"><label>Fecha instalación</label><input type="date" className="form-input" value={itemForm.install_date} onChange={e => setItemForm({ ...itemForm, install_date: e.target.value })} /></div>
                            </div>
                            <div className="form-group"><label>Color</label><div className="color-grid">{COLORS.map(c => <button key={c} type="button" title={c} className={`color-swatch ${itemForm.color === c ? 'selected' : ''}`} style={{ backgroundColor: c }} onClick={() => setItemForm({ ...itemForm, color: c })} />)}</div></div>
                            <div className="modal-actions"><button type="button" className="btn-cancel" onClick={() => setIsItemModal(false)}>Cancelar</button><button type="submit" className="btn-submit" disabled={saving}>{saving ? 'Guardando...' : editingItem ? 'Guardar' : 'Crear'}</button></div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Task */}
            {isTaskModal && (
                <div className="modal-overlay" onClick={() => setIsTaskModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h2>{editingTask ? 'Editar Tarea' : 'Nueva Tarea'}</h2><button type="button" className="close-btn" title="Cerrar" onClick={() => setIsTaskModal(false)}><X size={20} /></button></div>
                        <form onSubmit={handleTaskSubmit} className="modal-form">
                            {items.length > 0 && <div className="form-group"><label>Elemento</label><select className="form-select" title="Elemento" value={taskForm.item_id} onChange={e => setTaskForm({ ...taskForm, item_id: e.target.value })}><option value="">General (sin elemento)</option>{items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>}
                            <div className="form-row two-cols">
                                <div className="form-group"><label>Tipo</label><select className="form-select" title="Tipo" value={taskForm.type} onChange={e => setTaskForm({ ...taskForm, type: e.target.value as HomeMaintenance['type'] })}>{MAINT_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
                                <div className="form-group"><label>Estado</label><select className="form-select" title="Estado" value={taskForm.status} onChange={e => setTaskForm({ ...taskForm, status: e.target.value as HomeMaintenance['status'] })}><option value="scheduled">Pendiente</option><option value="completed">Completado</option><option value="cancelled">Cancelado</option></select></div>
                            </div>
                            <div className="form-group"><label>Descripción</label><input type="text" className="form-input" value={taskForm.name} onChange={e => setTaskForm({ ...taskForm, name: e.target.value })} required placeholder="Ej: Cambio de filtro" /></div>
                            <div className="form-row two-cols">
                                <div className="form-group"><label>Fecha</label><input type="date" className="form-input" value={taskForm.date} onChange={e => setTaskForm({ ...taskForm, date: e.target.value })} required /></div>
                                <div className="form-group"><label>Próxima fecha</label><input type="date" className="form-input" value={taskForm.next_date} onChange={e => setTaskForm({ ...taskForm, next_date: e.target.value })} /></div>
                            </div>
                            <div className="form-row two-cols">
                                <div className="form-group"><label>Costo</label><input type="number" className="form-input" value={taskForm.cost} onChange={e => setTaskForm({ ...taskForm, cost: e.target.value })} min="0" step="0.01" /></div>
                                <div className="form-group"><label>Proveedor</label><input type="text" className="form-input" value={taskForm.provider} onChange={e => setTaskForm({ ...taskForm, provider: e.target.value })} placeholder="Ej: Técnico Juan" /></div>
                            </div>
                            <div className="modal-actions"><button type="button" className="btn-cancel" onClick={() => setIsTaskModal(false)}>Cancelar</button><button type="submit" className="btn-submit" disabled={saving}>{saving ? 'Guardando...' : editingTask ? 'Guardar' : 'Crear'}</button></div>
                        </form>
                    </div>
                </div>
            )}

            {deleteConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="modal-content delete-modal" onClick={e => e.stopPropagation()}>
                        <AlertTriangle size={40} color="#F59E0B" /><h2>¿Eliminar?</h2><p>Esta acción no se puede deshacer.</p>
                        <div className="modal-actions"><button type="button" className="btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancelar</button><button type="button" className="btn-delete" onClick={handleDelete}>Eliminar</button></div>
                    </div>
                </div>
            )}
        </div>
    );
}
