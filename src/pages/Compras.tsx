import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Plus, Trash2, X, ShoppingCart, AlertTriangle, ChevronDown, ChevronUp,
    Archive, CheckCircle2, Circle, ArrowUp, Minus, Equal,
    Apple, SprayCanIcon, User, Pill, Smartphone, Shirt, Home, PawPrint, Package,
    ClipboardList,
    type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ShoppingList, ShoppingItem } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import './Compras.css';

const ITEM_CATS: { value: ShoppingItem['category']; label: string; icon: LucideIcon; color: string }[] = [
    { value: 'food',        label: 'Alimentos',   icon: Apple,         color: '#10B981' },
    { value: 'cleaning',    label: 'Limpieza',    icon: SprayCanIcon,  color: '#3B82F6' },
    { value: 'personal',    label: 'Personal',    icon: User,          color: '#8B5CF6' },
    { value: 'pharmacy',    label: 'Farmacia',    icon: Pill,          color: '#EF4444' },
    { value: 'electronics', label: 'Electrónica', icon: Smartphone,    color: '#F59E0B' },
    { value: 'clothing',    label: 'Ropa',        icon: Shirt,         color: '#EC4899' },
    { value: 'home',        label: 'Hogar',       icon: Home,          color: '#6366F1' },
    { value: 'pets',        label: 'Mascotas',    icon: PawPrint,      color: '#14B8A6' },
    { value: 'other',       label: 'Otro',        icon: Package,       color: '#94A3B8' },
];
const CAT_MAP = Object.fromEntries(ITEM_CATS.map(c => [c.value, c]));
const PRIORITY_ICONS: Record<string, LucideIcon> = { high: ArrowUp, normal: Equal, low: Minus };

function fmt(n: number, c: string) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: c, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

// ── Text parser helpers ─────────────────────────────────────────────────────

function normalizeUnit(u: string): string {
    if (/^kg|kilo/i.test(u)) return 'kg';
    if (/^lb|libra/i.test(u)) return 'lb';
    if (/^lt|litro/i.test(u)) return 'lt';
    if (/^ml/i.test(u)) return 'ml';
    if (/^gr|gramo|^g$/i.test(u)) return 'gr';
    if (/^paq|paquete/i.test(u)) return 'paq';
    return 'und';
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }

function guessCategory(name: string): ShoppingItem['category'] {
    const n = name.toLowerCase();
    if (/leche|pan\b|arroz|huevo|pollo|carne|res\b|cerdo|tomate|papa|queso|yogur|mantequilla|aceite|sal\b|azúcar|harina|pasta\b|frijol|lenteja|garbanzo|atún|sardina|avena|fruta|verdura|cebolla|ajo|zanahoria|lechuga|plátano|manzana|naranja|limón|yuca|maíz|arepa|chorizo|salchicha|jamón|café|chocolate|cereal|galleta|bizcocho|miel|mermelada|mayonesa|salsa|vinagre|mostaza|pimienta|panela|agua\b|gaseosa|refresco|jugo|sopa|crema de|cocoa|manteca|espagueti|fideos|arroz|pepino|espinaca|brócoli|coliflor|habichuela|champiñon|pimentón|aguacate|mango|papaya|melón|sandía|uva|fresa|mora/.test(n)) return 'food';
    if (/jabón|detergente|suavizante|blanqueador|limpiador|ajax|fabuloso|esponja|escoba|trapero|papel higiénico|servilleta|bolsa\b|limpiapisos|desinfectante|cera\b|pinesol|ariel|fab\b|rindex|toilet|lavaplatos|lavatrastos/.test(n)) return 'cleaning';
    if (/shampoo|champú|crema\b|desodorante|cepillo|pasta dental|afeitadora|acondicionador|toalla|pañal|jabón de tocador|loción|perfume|maquillaje|esmalte|tinte|depilador|preservativo|tampón|toalla higiénica/.test(n)) return 'personal';
    if (/medicamento|pastilla|jarabe|vitamina|aspirina|ibuprofeno|acetaminofén|antibiótico|suero|antigripal|antiácido|omeprazol|alcohol\b|algodón|curitas|termómetro|jeringa/.test(n)) return 'pharmacy';
    if (/bombillo|pila\b|vela\b|fósforo|escoba|destapacaño|llave|tornillo|pintura\b|brocha|extensión|cable/.test(n)) return 'home';
    if (/iphone|celular|tablet|audífonos|cargador|cable usb|mouse|teclado|memoria/.test(n)) return 'electronics';
    if (/camisa|pantalón|zapato|ropa|vestido|tenis|calcetín|media\b|interior|brassier|chaqueta|abrigo|sombrero/.test(n)) return 'clothing';
    if (/perro|gato|mascota|comida para|arena\b|correa|juguete para/.test(n)) return 'pets';
    return 'other';
}

interface ParsedItem {
    name: string;
    quantity: number;
    unit: string;
    category: ShoppingItem['category'];
    selected: boolean;
}

function parseLine(raw: string): ParsedItem | null {
    const line = raw.trim().replace(/^[-•*✓✗·]\s*/, '');
    if (!line) return null;

    let quantity = 1;
    let unit = 'und';
    let name = line;

    // "2 kg arroz" / "500 gr sal" / "3 litros leche" / "2 pollos"
    const leading = line.match(/^(\d+(?:[.,]\d+)?)\s*(kg|kilos?|lb|libras?|lt|litros?|ml|gr|gramos?|g|paq|paquetes?)?\s+(?:de\s+)?(.+)$/i);
    if (leading) {
        quantity = parseFloat(leading[1].replace(',', '.'));
        unit = normalizeUnit(leading[2] || '');
        name = leading[3].trim();
    } else {
        // "jabón rey x3" or "jabón (x3)"
        const trailing = line.match(/^(.+?)\s+[xX×](\d+)$/);
        if (trailing) {
            quantity = parseInt(trailing[2]);
            name = trailing[1].trim();
        }
    }

    return { name: capitalize(name), quantity, unit, category: guessCategory(name), selected: true };
}

function parseTextList(text: string): ParsedItem[] {
    return text.split('\n').map(parseLine).filter(Boolean) as ParsedItem[];
}

// ── Component ───────────────────────────────────────────────────────────────

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

    // Paste-list modal state
    const [pasteStep, setPasteStep] = useState<'idle' | 'paste' | 'canvas'>('idle');
    const [pasteText, setPasteText] = useState('');
    const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
    const [canvasListName, setCanvasListName] = useState('');
    const [importing, setImporting] = useState(false);

    const currency = profile?.currency || 'COP';

    const [listForm, setListForm] = useState({ name: '', budget_limit: '' });
    const [itemForm, setItemForm] = useState({
        list_id: '', name: '', category: 'food' as ShoppingItem['category'],
        quantity: '1', unit: 'und', estimated_price: '', priority: 'normal' as ShoppingItem['priority'], notes: '',
    });

    const showToast = useCallback((msg: string, type: 'success' | 'error') => {
        setToast({ message: msg, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

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
        await supabase.from('shopping_lists').insert({
            user_id: user.id, name: listForm.name,
            budget_limit: listForm.budget_limit ? parseFloat(listForm.budget_limit) : null,
            currency,
        });
        setIsListModal(false);
        setListForm({ name: '', budget_limit: '' });
        showToast('Lista creada', 'success');
        fetchData();
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
            unit: itemForm.unit || 'und',
            estimated_price: itemForm.estimated_price ? parseFloat(itemForm.estimated_price) : null,
            priority: itemForm.priority, notes: itemForm.notes || null,
        });
        setIsItemModal(false);
        setItemForm({ ...itemForm, name: '', estimated_price: '', notes: '' });
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

    // ── Paste & canvas ──────────────────────────────────────────────────────

    function openPasteModal() {
        setPasteText('');
        setParsedItems([]);
        setCanvasListName(`Mercado ${format(new Date(), "d MMM", { locale: es })}`);
        setPasteStep('paste');
    }

    function handleOrganize() {
        const parsed = parseTextList(pasteText);
        if (parsed.length === 0) { showToast('No encontré productos en el texto', 'error'); return; }
        setParsedItems(parsed);
        setPasteStep('canvas');
    }

    function toggleParsedItem(idx: number) {
        setParsedItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it));
    }

    function changeParsedCategory(idx: number, cat: ShoppingItem['category']) {
        setParsedItems(prev => prev.map((it, i) => i === idx ? { ...it, category: cat } : it));
    }

    async function handleImport() {
        if (!user || !canvasListName.trim()) return;
        const selected = parsedItems.filter(it => it.selected);
        if (selected.length === 0) { showToast('Selecciona al menos un producto', 'error'); return; }
        setImporting(true);
        const { data: list } = await supabase.from('shopping_lists')
            .insert({ user_id: user.id, name: canvasListName.trim(), currency })
            .select().single();
        if (!list) { showToast('Error al crear la lista', 'error'); setImporting(false); return; }
        await supabase.from('shopping_items').insert(
            selected.map(it => ({
                list_id: list.id, user_id: user.id,
                name: it.name, category: it.category,
                quantity: it.quantity, unit: it.unit,
                priority: 'normal' as const,
            }))
        );
        setPasteStep('idle');
        setImporting(false);
        showToast(`Lista creada con ${selected.length} productos`, 'success');
        fetchData();
        setExpandedList(list.id);
    }

    // Canvas grouped by category
    const canvasGrouped = useMemo(() => {
        const groups: Record<string, { items: Array<ParsedItem & { idx: number }>; cat: typeof ITEM_CATS[0] }> = {};
        parsedItems.forEach((it, idx) => {
            if (!groups[it.category]) groups[it.category] = { items: [], cat: CAT_MAP[it.category] };
            groups[it.category].items.push({ ...it, idx });
        });
        return groups;
    }, [parsedItems]);

    if (loading) return <div className="loading-screen">Cargando...</div>;

    return (
        <div className="compras-container">
            {toast && <div className={`shop-toast ${toast.type}`}>{toast.message}</div>}

            <div className="compras-header">
                <div>
                    <h1>Lista de Compras</h1>
                    <p>Crea listas manualmente o pega tu lista de texto y la organizamos</p>
                </div>
                <button type="button" className="btn-paste" onClick={openPasteModal}>
                    <ClipboardList size={18} /> Pegar lista de texto
                </button>
            </div>

            {/* Active Lists */}
            {activeLists.length === 0 ? (
                <div className="compras-empty">
                    <ShoppingCart size={48} />
                    <h3>No tienes listas de compras</h3>
                    <p>Crea una lista manualmente o pega tu lista de texto</p>
                    <div className="empty-actions">
                        <button type="button" className="empty-add-btn secondary" onClick={openPasteModal}><ClipboardList size={18} /> Pegar lista</button>
                        <button type="button" className="empty-add-btn" onClick={() => setIsListModal(true)}><Plus size={18} /> Nueva Lista</button>
                    </div>
                </div>
            ) : (
                <div className="lists-container">
                    {activeLists.map(list => {
                        const stats = getListStats(list.id);
                        const listItems = getListItems(list.id);
                        const isExpanded = expandedList === list.id;
                        const overBudget = list.budget_limit && stats.actual > list.budget_limit;

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
                                            {list.budget_limit
                                                ? ` ${fmt(stats.actual, currency)} de ${fmt(list.budget_limit, currency)}`
                                                : ` ${fmt(stats.estimated, currency)} estimado`}
                                        </span>
                                        {stats.total > 0 && (
                                            <div className="list-progress">
                                                <div className="list-progress-bar" style={{ width: `${stats.progress}%` }} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="list-actions">
                                        <button type="button" title="Agregar producto" className="la-btn add" onClick={e => { e.stopPropagation(); openAddItem(list.id); }}><Plus size={16} /></button>
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
                                            <p className="no-items">Lista vacía — agrega productos con el botón +</p>
                                        ) : Object.entries(grouped).map(([cat, catItems]) => {
                                            const catInfo = CAT_MAP[cat];
                                            const CatIcon = catInfo?.icon || Package;
                                            return (
                                                <div key={cat} className="item-group">
                                                    <div className="item-group-header" style={{ color: catInfo?.color }}>
                                                        <CatIcon size={14} /><span>{catInfo?.label || cat}</span>
                                                    </div>
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

            {/* ── Modal: Nueva Lista manual ── */}
            {isListModal && (
                <div className="modal-overlay" onClick={() => setIsListModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Nueva Lista</h2>
                            <button type="button" className="close-btn" title="Cerrar" onClick={() => setIsListModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleListSubmit} className="modal-form">
                            <div className="form-group"><label>Nombre</label><input type="text" className="form-input" value={listForm.name} onChange={e => setListForm({ ...listForm, name: e.target.value })} required placeholder="Ej: Supermercado semanal" autoFocus /></div>
                            <div className="form-group"><label>Presupuesto máximo (opcional)</label><input type="number" className="form-input" value={listForm.budget_limit} onChange={e => setListForm({ ...listForm, budget_limit: e.target.value })} min="0" step="0.01" placeholder="Ej: 200000" /></div>
                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsListModal(false)}>Cancelar</button>
                                <button type="submit" className="btn-submit">Crear Lista</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal: Agregar producto ── */}
            {isItemModal && (
                <div className="modal-overlay" onClick={() => setIsItemModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Agregar Producto</h2>
                            <button type="button" className="close-btn" title="Cerrar" onClick={() => setIsItemModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleItemSubmit} className="modal-form">
                            <div className="form-group"><label>Producto</label><input type="text" className="form-input" value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} required placeholder="Ej: Leche" autoFocus /></div>
                            <div className="form-row two-cols">
                                <div className="form-group"><label>Categoría</label>
                                    <select className="form-select" title="Categoría" value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value as ShoppingItem['category'] })}>
                                        {ITEM_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div className="form-group"><label>Prioridad</label>
                                    <select className="form-select" title="Prioridad" value={itemForm.priority} onChange={e => setItemForm({ ...itemForm, priority: e.target.value as ShoppingItem['priority'] })}>
                                        <option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baja</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-row three-cols">
                                <div className="form-group"><label>Cantidad</label><input type="number" className="form-input" value={itemForm.quantity} onChange={e => setItemForm({ ...itemForm, quantity: e.target.value })} min="0.1" step="0.1" /></div>
                                <div className="form-group"><label>Unidad</label>
                                    <select className="form-select" title="Unidad" value={itemForm.unit} onChange={e => setItemForm({ ...itemForm, unit: e.target.value })}>
                                        <option value="und">und</option><option value="kg">kg</option><option value="lb">lb</option><option value="lt">lt</option><option value="ml">ml</option><option value="gr">gr</option><option value="paq">paq</option>
                                    </select>
                                </div>
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

            {/* ── Modal: Pegar lista — Step 1: textarea ── */}
            {pasteStep === 'paste' && (
                <div className="modal-overlay" onClick={() => setPasteStep('idle')}>
                    <div className="modal-content paste-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h2>Pegar lista de texto</h2>
                                <p className="modal-sub">Escribe o pega tu lista — un producto por línea</p>
                            </div>
                            <button type="button" className="close-btn" title="Cerrar" onClick={() => setPasteStep('idle')}><X size={20} /></button>
                        </div>
                        <div className="modal-form">
                            <div className="paste-hints">
                                <span>Ejemplos: <em>2 lt leche</em> · <em>jabón rey</em> · <em>500 gr arroz</em> · <em>pollo x2</em></span>
                            </div>
                            <textarea
                                className="paste-textarea"
                                value={pasteText}
                                onChange={e => setPasteText(e.target.value)}
                                placeholder={"2 lt leche\nPan tajado\n3 kg arroz\nJabón rey\nShampoo\n500 gr sal\n..."}
                                rows={12}
                                autoFocus
                            />
                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setPasteStep('idle')}>Cancelar</button>
                                <button type="button" className="btn-submit" onClick={handleOrganize} disabled={!pasteText.trim()}>
                                    Organizar →
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Pegar lista — Step 2: canvas preview ── */}
            {pasteStep === 'canvas' && (
                <div className="modal-overlay canvas-overlay" onClick={() => setPasteStep('idle')}>
                    <div className="canvas-modal" onClick={e => e.stopPropagation()}>
                        <div className="canvas-modal-header">
                            <div className="canvas-title-row">
                                <button type="button" className="back-btn" title="Volver" onClick={() => setPasteStep('paste')}>← Volver</button>
                                <input
                                    type="text"
                                    className="canvas-list-name"
                                    value={canvasListName}
                                    onChange={e => setCanvasListName(e.target.value)}
                                    placeholder="Nombre de la lista"
                                />
                                <button
                                    type="button"
                                    className="btn-import"
                                    onClick={handleImport}
                                    disabled={importing || parsedItems.filter(i => i.selected).length === 0}
                                >
                                    {importing ? 'Importando...' : `Importar ${parsedItems.filter(i => i.selected).length} productos`}
                                </button>
                            </div>
                            <p className="canvas-hint">Toca un producto para deseleccionarlo. Cambia su categoría con el selector.</p>
                        </div>

                        <div className="canvas-grid">
                            {Object.entries(canvasGrouped).map(([cat, { items: catItems, cat: catInfo }]) => {
                                const CatIcon = catInfo.icon;
                                const selectedCount = catItems.filter(i => i.selected).length;
                                return (
                                    <div key={cat} className="canvas-card">
                                        <div className="canvas-card-header" style={{ background: catInfo.color }}>
                                            <CatIcon size={16} />
                                            <span>{catInfo.label}</span>
                                            <span className="canvas-count">{selectedCount}/{catItems.length}</span>
                                        </div>
                                        <div className="canvas-card-items">
                                            {catItems.map(item => (
                                                <div key={item.idx} className={`canvas-item ${item.selected ? '' : 'deselected'}`}>
                                                    <button type="button" className="canvas-check" onClick={() => toggleParsedItem(item.idx)}>
                                                        {item.selected ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                                                    </button>
                                                    <div className="canvas-item-info">
                                                        <span className="canvas-item-name">{item.name}</span>
                                                        <span className="canvas-item-qty">{item.quantity} {item.unit}</span>
                                                    </div>
                                                    <select
                                                        title="Categoría"
                                                        className="canvas-cat-select"
                                                        value={item.category}
                                                        onChange={e => changeParsedCategory(item.idx, e.target.value as ShoppingItem['category'])}
                                                        onClick={e => e.stopPropagation()}
                                                    >
                                                        {ITEM_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Eliminar ── */}
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
