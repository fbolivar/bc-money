import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ShoppingCart, Plus, ArrowLeft, Check, X, Upload,
    FileText, Camera, ChevronRight, Trash2, Package,
    Search, History, Store, Circle, CheckCircle2, ClipboardList,
    AlertTriangle, RotateCcw, Link2, Repeat2, ChevronDown,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { MarketStore, MarketProduct, ShoppingList, ShoppingItem } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRecommendations, type RecType } from '../hooks/useRecommendations';
import './Compras.css';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_STORES = [
    { name: 'Supermercado',       emoji: '🛒', color: '#3B82F6' },
    { name: 'Frutas y Verduras',  emoji: '🥦', color: '#22C55E' },
    { name: 'Carnes',             emoji: '🥩', color: '#EF4444' },
];

// Productos semilla por índice de tienda (mismo orden que DEFAULT_STORES)
const DEFAULT_PRODUCTS: { name: string; unit: string }[][] = [
    // Supermercado
    [
        { name: 'Arroz', unit: 'kg' },
        { name: 'Aceite vegetal', unit: 'lt' },
        { name: 'Azúcar', unit: 'kg' },
        { name: 'Sal', unit: 'kg' },
        { name: 'Harina de trigo', unit: 'kg' },
        { name: 'Pasta', unit: 'paq' },
        { name: 'Lentejas', unit: 'kg' },
        { name: 'Fríjoles', unit: 'kg' },
        { name: 'Salsa de tomate', unit: 'bot' },
        { name: 'Atún en lata', unit: 'und' },
        { name: 'Leche', unit: 'lt' },
        { name: 'Huevos', unit: 'und' },
        { name: 'Mantequilla', unit: 'und' },
        { name: 'Queso', unit: 'gr' },
        { name: 'Yogurt', unit: 'und' },
        { name: 'Pan tajado', unit: 'und' },
        { name: 'Papel higiénico', unit: 'paq' },
        { name: 'Jabón de baño', unit: 'und' },
        { name: 'Shampoo', unit: 'bot' },
        { name: 'Detergente', unit: 'und' },
        { name: 'Jabón lavar loza', unit: 'und' },
        { name: 'Desinfectante', unit: 'bot' },
    ],
    // Frutas y Verduras
    [
        { name: 'Tomate', unit: 'kg' },
        { name: 'Cebolla cabezona', unit: 'kg' },
        { name: 'Papa', unit: 'kg' },
        { name: 'Zanahoria', unit: 'kg' },
        { name: 'Ajo', unit: 'und' },
        { name: 'Limón', unit: 'kg' },
        { name: 'Plátano', unit: 'kg' },
        { name: 'Banano', unit: 'kg' },
        { name: 'Manzana', unit: 'kg' },
        { name: 'Naranja', unit: 'kg' },
        { name: 'Aguacate', unit: 'und' },
        { name: 'Lechuga', unit: 'und' },
        { name: 'Cilantro', unit: 'und' },
        { name: 'Pimentón', unit: 'und' },
        { name: 'Pepino cohombro', unit: 'und' },
        { name: 'Espinaca', unit: 'und' },
        { name: 'Habichuela', unit: 'kg' },
        { name: 'Yuca', unit: 'kg' },
    ],
    // Carnes
    [
        { name: 'Pechuga de pollo', unit: 'kg' },
        { name: 'Pollo entero', unit: 'kg' },
        { name: 'Muslos de pollo', unit: 'kg' },
        { name: 'Carne molida de res', unit: 'kg' },
        { name: 'Costilla de res', unit: 'kg' },
        { name: 'Lomo de cerdo', unit: 'kg' },
        { name: 'Chorizo', unit: 'und' },
        { name: 'Salchicha', unit: 'paq' },
        { name: 'Jamón', unit: 'gr' },
        { name: 'Filete de tilapia', unit: 'kg' },
        { name: 'Camarón', unit: 'kg' },
    ],
];

const UNIT_OPTIONS = ['und', 'kg', 'gr', 'lb', 'lt', 'ml', 'paq', 'doc', 'caj', 'bot'];

const STORE_EMOJIS = [
    '🛒','🥦','🥩','🥛','🍞','🧴','💊','🏪','🥫','🧺',
    '🌾','🐟','🍳','🧼','🌿','🍷','🍺','🛍️','🏬','🐾',
];

const STORE_COLORS = [
    '#3B82F6','#22C55E','#EF4444','#F59E0B','#8B5CF6',
    '#EC4899','#14B8A6','#6366F1','#F97316','#64748B',
];

const REC_LABELS: Record<RecType, string> = {
    goes_with:       'Va con lo que ya tienes',
    missing_typical: 'Siempre lo llevas — ¿lo olvidaste?',
    last_time:       'Lo llevaste la vez pasada',
    frequent:        'Lo compras frecuentemente',
};

// ── Types ────────────────────────────────────────────────────────────────────

interface SelectionItem {
    product: MarketProduct;
    qty: number;
    unit: string;
}

type View = 'catalog' | 'list' | 'history';
type ImportStep = 'idle' | 'paste' | 'file' | 'preview';
interface ParsedLine { name: string; unit: string; selected: boolean }

// ── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function parseLine(raw: string): ParsedLine | null {
    const line = raw.trim().replace(/^[-•*✓✗·\d+.]\s*/, '').trim();
    if (!line) return null;
    const m = line.match(/^(\d+(?:[.,]\d+)?)\s*(kg|gr|lb|lt|ml|paq|und|doc|caj|bot)?\s+(?:de\s+)?(.+)$/i);
    if (m) return { name: capitalize(m[3].trim()), unit: (m[2] || 'und').toLowerCase(), selected: true };
    return { name: capitalize(line), unit: 'und', selected: true };
}

function parseText(text: string): ParsedLine[] {
    return text.split('\n').map(parseLine).filter((x): x is ParsedLine => x !== null);
}

// ── Component ────────────────────────────────────────────────────────────────

export function Compras() {
    const { user } = useAuth();

    // Data
    const [stores, setStores] = useState<MarketStore[]>([]);
    const [products, setProducts] = useState<MarketProduct[]>([]);
    const [activeList, setActiveList] = useState<ShoppingList | null>(null);
    const [activeItems, setActiveItems] = useState<ShoppingItem[]>([]);
    const [pastLists, setPastLists] = useState<ShoppingList[]>([]);

    // Navigation
    const [view, setView] = useState<View>('catalog');
    const [activeStoreId, setActiveStoreId] = useState<string | null>(null);

    // Selection (items to add to the next shopping list)
    const [selection, setSelection] = useState<Map<string, SelectionItem>>(new Map());

    // UI
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [createError, setCreateError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddStore, setShowAddStore] = useState(false);
    const [showAddProduct, setShowAddProduct] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [importStep, setImportStep] = useState<ImportStep>('idle');
    const [importText, setImportText] = useState('');
    const [importPreview, setImportPreview] = useState<ParsedLine[]>([]);
    const [recsCollapsed, setRecsCollapsed] = useState(false);

    // Forms
    const [newStoreName, setNewStoreName] = useState('');
    const [newStoreEmoji, setNewStoreEmoji] = useState('🏪');
    const [newStoreColor, setNewStoreColor] = useState('#6366F1');
    const [newProductName, setNewProductName] = useState('');
    const [newProductUnit, setNewProductUnit] = useState('und');

    // ── Load ──────────────────────────────────────────────────────────────────

    const loadData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setLoadError(null);
        try {
            // Catálogo compartido — todos los usuarios ven las mismas tiendas y productos
            const { data: storesData, error: storesErr } = await supabase
                .from('market_stores')
                .select('*')
                .order('sort_order');
            if (storesErr) throw storesErr;
            setStores(storesData || []);

            // Products
            const { data: productsData, error: productsErr } = await supabase
                .from('market_products')
                .select('*')
                .order('section', { nullsFirst: false })
                .order('name');
            if (productsErr) throw productsErr;
            setProducts(productsData || []);

            // Active list
            const { data: listData, error: listErr } = await supabase
                .from('shopping_lists')
                .select('*')
                .eq('user_id', user.id)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1);
            if (listErr) throw listErr;

            if (listData && listData.length > 0) {
                setActiveList(listData[0]);
                const { data: itemsData, error: itemsErr } = await supabase
                    .from('shopping_items')
                    .select('*')
                    .eq('list_id', listData[0].id)
                    .order('created_at');
                if (itemsErr) throw itemsErr;
                setActiveItems(itemsData || []);
            } else {
                setActiveList(null);
                setActiveItems([]);
            }

            // History
            const { data: pastData, error: pastErr } = await supabase
                .from('shopping_lists')
                .select('*')
                .eq('user_id', user.id)
                .in('status', ['completed', 'archived'])
                .order('created_at', { ascending: false })
                .limit(30);
            if (pastErr) throw pastErr;
            setPastLists(pastData || []);
        } catch (err) {
            console.error('Compras loadData:', err);
            setLoadError('No se pudo cargar el catálogo. Verifica tu conexión.');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => { loadData(); }, [loadData]);

    // ── Recommendations ───────────────────────────────────────────────────────

    const selectedIds = useMemo(() => [...selection.keys()], [selection]);
    const { recs } = useRecommendations(activeStoreId, products, selectedIds);

    // ── Derived ───────────────────────────────────────────────────────────────

    const activeStore = stores.find(s => s.id === activeStoreId);
    const storeProducts = products.filter(p => p.store_id === activeStoreId);
    const filteredProducts = searchQuery
        ? storeProducts.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : storeProducts;

    const SECTION_ORDER = [
        'Frutas','Verduras y Hortalizas','Tubérculos y Plátanos',
        'Lácteos y Huevos','Granos y Cereales','Aceites, Salsas y Condimentos',
        'Panadería y Galletería','Snacks y Dulces','Embutidos y Enlatados','Bebidas',
        'Aseo Personal','Aseo del Hogar',
        'Pollo','Res','Cerdo','Mariscos',
        'Otros','General',
    ];

    const productsBySection = Object.values(
        filteredProducts.reduce<Record<string, { section: string; items: typeof filteredProducts }>>((acc, p) => {
            const sec = p.section || 'General';
            if (!acc[sec]) acc[sec] = { section: sec, items: [] };
            acc[sec].items.push(p);
            return acc;
        }, {})
    ).sort((a, b) => {
        const ia = SECTION_ORDER.indexOf(a.section);
        const ib = SECTION_ORDER.indexOf(b.section);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    const countByStore = (sid: string) => products.filter(p => p.store_id === sid).length;
    const selectedByStore = (sid: string) =>
        [...selection.values()].filter(s => s.product.store_id === sid).length;

    const itemsBySection = (() => {
        const map: Record<string, ShoppingItem[]> = {};
        for (const item of activeItems) {
            const product = products.find(p => p.id === item.product_id);
            const sec = product?.section || (stores.find(s => s.id === item.store_id)?.name) || 'General';
            if (!map[sec]) map[sec] = [];
            map[sec].push(item);
        }
        return Object.entries(map).sort(([a], [b]) => {
            const ia = SECTION_ORDER.indexOf(a);
            const ib = SECTION_ORDER.indexOf(b);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        });
    })();

    // ── Catalog actions ───────────────────────────────────────────────────────

    const toggleProduct = (product: MarketProduct) => {
        setSelection(prev => {
            const next = new Map(prev);
            if (next.has(product.id)) next.delete(product.id);
            else next.set(product.id, { product, qty: 1, unit: product.unit });
            return next;
        });
    };

    const updateQty = (productId: string, delta: number) => {
        setSelection(prev => {
            const next = new Map(prev);
            const item = next.get(productId);
            if (item) next.set(productId, { ...item, qty: Math.max(0.5, parseFloat((item.qty + delta).toFixed(1))) });
            return next;
        });
    };

    const addStore = async () => {
        if (!user || !newStoreName.trim()) return;
        const { data } = await supabase
            .from('market_stores')
            .insert({ user_id: user.id, name: newStoreName.trim(), emoji: newStoreEmoji, color: newStoreColor, sort_order: stores.length })
            .select().single();
        if (data) {
            setStores(prev => [...prev, data]);
            setNewStoreName(''); setShowAddStore(false);
        }
    };

    const deleteStore = async (storeId: string) => {
        if (!confirm('¿Eliminar esta categoría y todos sus productos?')) return;
        const { error } = await supabase.from('market_stores').delete().eq('id', storeId);
        if (error) { console.error('deleteStore:', error); return; }
        setStores(prev => prev.filter(s => s.id !== storeId));
        setProducts(prev => prev.filter(p => p.store_id !== storeId));
        setSelection(prev => {
            const next = new Map(prev);
            for (const [k, v] of next) { if (v.product.store_id === storeId) next.delete(k); }
            return next;
        });
        if (activeStoreId === storeId) setActiveStoreId(null);
    };

    const addProduct = async () => {
        if (!user || !activeStoreId || !newProductName.trim()) return;
        const { data } = await supabase
            .from('market_products')
            .insert({ user_id: user.id, store_id: activeStoreId, name: newProductName.trim(), unit: newProductUnit, sort_order: storeProducts.length })
            .select().single();
        if (data) {
            setProducts(prev => [...prev, data]);
            setNewProductName(''); setNewProductUnit('und'); setShowAddProduct(false);
        }
    };

    const deleteProduct = async (productId: string) => {
        const { error } = await supabase.from('market_products').delete().eq('id', productId);
        if (error) { console.error('deleteProduct:', error); return; }
        setProducts(prev => prev.filter(p => p.id !== productId));
        setSelection(prev => { const next = new Map(prev); next.delete(productId); return next; });
    };

    // ── Shopping list actions ─────────────────────────────────────────────────

    const createList = async () => {
        if (!user || selection.size === 0) return;
        setCreateError(null);
        const name = `Mercado ${format(new Date(), "d 'de' MMM", { locale: es })}`;
        const { data: list, error } = await supabase
            .from('shopping_lists')
            .insert({ user_id: user.id, name, status: 'active', currency: 'COP' })
            .select().single();
        if (error || !list) {
            console.error('createList list insert:', error);
            setCreateError(`Error al crear la lista: ${error?.message || 'sin respuesta'}`);
            return;
        }

        const rows = [...selection.values()].map(s => ({
            list_id: list.id,
            user_id: user.id,
            name: s.product.name,
            quantity: s.qty,
            unit: s.unit,
            category: 'other' as const,
            store_id: s.product.store_id,
            product_id: s.product.id,
            is_checked: false,
            priority: 'normal' as const,
        }));
        const { error: insertErr } = await supabase.from('shopping_items').insert(rows);
        if (insertErr) {
            console.error('createList items insert:', insertErr);
            setCreateError(`Error al guardar productos: ${insertErr.message}`);
            await supabase.from('shopping_lists').delete().eq('id', list.id);
            return;
        }

        setSelection(new Map());
        setView('list');
        await loadData();
    };

    const toggleItem = async (item: ShoppingItem) => {
        // Optimistic update so the checkbox feels instant
        setActiveItems(prev => prev.map(i => i.id === item.id ? { ...i, is_checked: !item.is_checked } : i));
        const { data, error } = await supabase
            .from('shopping_items')
            .update({ is_checked: !item.is_checked })
            .eq('id', item.id)
            .select().single();
        if (error) {
            // Revert optimistic update on failure
            setActiveItems(prev => prev.map(i => i.id === item.id ? item : i));
            console.error('toggleItem:', error);
        } else if (data) {
            setActiveItems(prev => prev.map(i => i.id === item.id ? data : i));
        }
    };

    const completeList = async () => {
        if (!activeList) return;
        await supabase.from('shopping_lists').update({ status: 'completed' }).eq('id', activeList.id);
        setActiveList(null); setActiveItems([]);
        setView('catalog');
        await loadData();
    };

    // ── Import ────────────────────────────────────────────────────────────────

    const importProducts = async () => {
        if (!user || !activeStoreId) return;
        const toAdd = importPreview.filter(p => p.selected);
        if (toAdd.length === 0) return;
        const { data } = await supabase
            .from('market_products')
            .insert(toAdd.map((p, i) => ({
                user_id: user.id, store_id: activeStoreId,
                name: p.name, unit: p.unit,
                sort_order: storeProducts.length + i,
            })))
            .select();
        if (data) setProducts(prev => [...prev, ...data]);
        setShowImport(false); setImportText(''); setImportPreview([]); setImportStep('idle');
    };

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const text = ev.target?.result as string;
            setImportText(text);
            setImportPreview(parseText(text));
            setImportStep('preview');
        };
        reader.readAsText(file);
    };

    const closeImport = () => {
        setShowImport(false); setImportText(''); setImportPreview([]); setImportStep('idle');
    };

    // ── Render ────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="compras-page">
                <div className="compras-loading">
                    <ShoppingCart size={36} />
                    <p>Cargando catálogo...</p>
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="compras-page">
                <div className="compras-loading">
                    <AlertTriangle size={36} style={{ color: 'var(--color-danger)' }} />
                    <p style={{ color: 'var(--color-danger)' }}>{loadError}</p>
                    <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => { setLoadError(null); loadData(); }}>
                        <RotateCcw size={16} /> Reintentar
                    </button>
                </div>
            </div>
        );
    }

    const checkedCount = activeItems.filter(i => i.is_checked).length;

    return (
        <div className="compras-page">

            {/* ── Header ── */}
            <div className="compras-header">
                <div className="compras-header-left">
                    {activeStoreId && view === 'catalog' && (
                        <button
                            className="compras-back-btn"
                            onClick={() => { setActiveStoreId(null); setSearchQuery(''); setShowAddProduct(false); }}
                        >
                            <ArrowLeft size={20} />
                        </button>
                    )}
                    <div>
                        <h1 className="compras-title">
                            {view === 'catalog' && activeStoreId ? activeStore?.name
                                : view === 'list' ? 'Mi Lista'
                                : view === 'history' ? 'Historial'
                                : 'Compras'}
                        </h1>
                        {view === 'catalog' && !activeStoreId && (
                            <p className="compras-subtitle">Selecciona lo que necesitas mercar</p>
                        )}
                    </div>
                </div>
                {view === 'catalog' && activeStoreId && (
                    <div className="compras-header-actions">
                        <button className="compras-icon-btn" onClick={() => setShowImport(true)} title="Importar lista">
                            <Upload size={18} />
                        </button>
                        <button className="compras-icon-btn" onClick={() => setShowAddProduct(!showAddProduct)} title="Agregar producto">
                            <Plus size={18} />
                        </button>
                    </div>
                )}
            </div>

            {/* ── Tabs ── */}
            {!activeStoreId && (
                <div className="compras-tabs">
                    {([
                        { id: 'catalog', icon: Store, label: 'Catálogo' },
                        { id: 'list',    icon: ClipboardList, label: 'Mi Lista' },
                        { id: 'history', icon: History, label: 'Historial' },
                    ] as const).map(tab => (
                        <button
                            key={tab.id}
                            className={`compras-tab ${view === tab.id ? 'active' : ''}`}
                            onClick={() => setView(tab.id)}
                        >
                            <tab.icon size={15} />
                            {tab.label}
                            {tab.id === 'list' && activeList && activeItems.length > 0 && (
                                <span className="tab-badge">{activeItems.length - checkedCount}</span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* ══════════════ CATALOG — STORES GRID ══════════════ */}
            {view === 'catalog' && !activeStoreId && (
                <div className="compras-content">
                    <div className="stores-grid">
                        {stores.map(store => {
                            const selCount = selectedByStore(store.id);
                            return (
                                <button
                                    key={store.id}
                                    className="store-card"
                                    style={{ '--store-color': store.color } as React.CSSProperties}
                                    onClick={() => setActiveStoreId(store.id)}
                                >
                                    <div className="store-emoji">{store.emoji}</div>
                                    <div className="store-body">
                                        <span className="store-name">{store.name}</span>
                                        <span className="store-count">{countByStore(store.id)} productos</span>
                                    </div>
                                    {selCount > 0 && (
                                        <span className="store-sel-badge">{selCount}</span>
                                    )}
                                    <ChevronRight size={16} className="store-arrow" />
                                </button>
                            );
                        })}

                        {/* Add store */}
                        <button className="store-card store-card-add" onClick={() => setShowAddStore(true)}>
                            <div className="store-emoji store-emoji-add"><Plus size={20} /></div>
                            <div className="store-body">
                                <span className="store-name">Nueva categoría</span>
                                <span className="store-count">Agregar lugar de compra</span>
                            </div>
                        </button>
                    </div>
                </div>
            )}

            {/* ══════════════ CATALOG — PRODUCT LIST ═════════════ */}
            {view === 'catalog' && activeStoreId && (
                <div className="compras-content">
                    {/* Search */}
                    <div className="products-search-wrap">
                        <Search size={15} className="products-search-icon" />
                        <input
                            className="products-search-input"
                            placeholder="Buscar producto..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button className="products-search-clear" onClick={() => setSearchQuery('')}>
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* ── Recommendations panel ── */}
                    {recs.length > 0 && (
                        <div className="recs-panel">
                            <button
                                className="recs-header"
                                onClick={() => setRecsCollapsed(c => !c)}
                            >
                                <span className="recs-title">✨ Sugeridos para ti</span>
                                <span className="recs-count">{recs.length}</span>
                                <ChevronDown
                                    size={15}
                                    className={`recs-chevron ${recsCollapsed ? 'collapsed' : ''}`}
                                />
                            </button>
                            {!recsCollapsed && (
                                <div className="recs-chips">
                                    {recs.map(rec => (
                                        <button
                                            key={rec.product.id}
                                            className={`rec-chip rec-chip-${rec.type}`}
                                            onClick={() => toggleProduct(rec.product)}
                                            title={REC_LABELS[rec.type]}
                                        >
                                            <span className="rec-chip-icon">
                                                {rec.type === 'goes_with'       && <Link2      size={12} />}
                                                {rec.type === 'missing_typical' && <AlertTriangle size={12} />}
                                                {rec.type === 'last_time'       && <RotateCcw   size={12} />}
                                                {rec.type === 'frequent'        && <Repeat2     size={12} />}
                                            </span>
                                            <span className="rec-chip-name">{rec.product.name}</span>
                                            {rec.count > 1 && (
                                                <span className="rec-chip-count">{rec.count}×</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Inline add product form */}
                    {showAddProduct && (
                        <div className="product-add-form">
                            <input
                                className="product-add-input"
                                type="text"
                                placeholder="Nombre del producto"
                                value={newProductName}
                                onChange={e => setNewProductName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addProduct()}
                                autoFocus
                            />
                            <select
                                className="product-add-unit"
                                value={newProductUnit}
                                onChange={e => setNewProductUnit(e.target.value)}
                            >
                                {UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
                            </select>
                            <button className="product-add-ok" onClick={addProduct}>
                                <Check size={15} />
                            </button>
                            <button className="product-add-cancel" onClick={() => setShowAddProduct(false)}>
                                <X size={15} />
                            </button>
                        </div>
                    )}

                    {/* Product rows */}
                    <div className="products-list">
                        {filteredProducts.length === 0 && (
                            <div className="products-empty">
                                <Package size={44} />
                                {searchQuery
                                    ? <p>Sin resultados para "{searchQuery}"</p>
                                    : <>
                                        <p>No hay productos todavía</p>
                                        <p className="products-empty-hint">
                                            Agrega con el botón <Plus size={13} /> o importa una lista con <Upload size={13} />
                                        </p>
                                    </>
                                }
                            </div>
                        )}

                        {productsBySection.map(({ section, items }) => (
                            <div key={section} className="product-section">
                                <div className="product-section-header">{section}</div>
                                {items.map(product => {
                                    const sel = selection.get(product.id);
                                    return (
                                        <div key={product.id} className={`product-row ${sel ? 'selected' : ''}`}>
                                            <button className="product-check" onClick={() => toggleProduct(product)}>
                                                {sel ? <CheckCircle2 size={21} /> : <Circle size={21} />}
                                            </button>
                                            <div className="product-info">
                                                <span className="product-name">{product.name}</span>
                                                <span className="product-unit">{product.unit}</span>
                                            </div>
                                            {sel && (
                                                <div className="product-qty">
                                                    <button onClick={() => updateQty(product.id, -0.5)}>−</button>
                                                    <span>{sel.qty}</span>
                                                    <button onClick={() => updateQty(product.id, +0.5)}>+</button>
                                                </div>
                                            )}
                                            <button className="product-delete" onClick={() => deleteProduct(product.id)} title="Eliminar del catálogo">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    {/* Delete store link */}
                    <button className="delete-store-btn" onClick={() => deleteStore(activeStoreId)}>
                        <Trash2 size={13} />
                        Eliminar categoría
                    </button>
                </div>
            )}

            {/* ══════════════ MY LIST VIEW ════════════════════════ */}
            {view === 'list' && !activeStoreId && (
                <div className="compras-content">
                    {!activeList ? (
                        <div className="list-empty">
                            <ClipboardList size={52} />
                            <h3>No hay lista activa</h3>
                            <p>Ve al Catálogo, selecciona productos y crea tu lista de mercado</p>
                            <button className="btn-primary-sm" onClick={() => setView('catalog')}>
                                Ir al Catálogo
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="active-list-header">
                                <div>
                                    <h2 className="active-list-name">{activeList.name}</h2>
                                    <p className="active-list-meta">
                                        {format(new Date(activeList.created_at), "d 'de' MMMM", { locale: es })}
                                        {'  ·  '}{checkedCount}/{activeItems.length} listos
                                    </p>
                                </div>
                            </div>

                            <div className="active-list-progress">
                                <div
                                    className="active-list-progress-bar"
                                    style={{ width: activeItems.length ? `${(checkedCount / activeItems.length) * 100}%` : '0%' }}
                                />
                            </div>

                            {itemsBySection.map(([section, items]) => (
                                <div key={section} className="list-store-group">
                                    <div className="list-store-header">
                                        <span className="list-store-name">{section}</span>
                                        <span className="list-store-count">
                                            {items.filter(i => i.is_checked).length}/{items.length}
                                        </span>
                                    </div>
                                    {items.map(item => (
                                        <button
                                            key={item.id}
                                            className={`list-item ${item.is_checked ? 'checked' : ''}`}
                                            onClick={() => toggleItem(item)}
                                        >
                                            <span className="list-item-check">
                                                {item.is_checked ? <CheckCircle2 size={19} /> : <Circle size={19} />}
                                            </span>
                                            <span className="list-item-name">{item.name}</span>
                                            <span className="list-item-qty">{item.quantity} {item.unit}</span>
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </>
                    )}
                </div>
            )}

            {/* ══════════════ HISTORY VIEW ════════════════════════ */}
            {view === 'history' && !activeStoreId && (
                <div className="compras-content">
                    {pastLists.length === 0 ? (
                        <div className="list-empty">
                            <History size={52} />
                            <h3>Sin historial</h3>
                            <p>Las listas completadas aparecerán aquí</p>
                        </div>
                    ) : (
                        <div className="history-list">
                            {pastLists.map(list => (
                                <div key={list.id} className="history-item">
                                    <div className="history-icon">
                                        <ShoppingCart size={17} />
                                    </div>
                                    <div className="history-info">
                                        <span className="history-name">{list.name}</span>
                                        <span className="history-date">
                                            {format(new Date(list.created_at), "d MMM yyyy · HH:mm", { locale: es })}
                                        </span>
                                    </div>
                                    <span className={`history-status history-status-${list.status}`}>
                                        {list.status === 'completed' ? 'Completado' : 'Archivado'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════ SELECTION BAR ═══════════════════════ */}
            {createError && (
                <div className="compras-error-banner">
                    <AlertTriangle size={15} />
                    <span>{createError}</span>
                    <button onClick={() => setCreateError(null)}><X size={13} /></button>
                </div>
            )}
            {selection.size > 0 && view === 'catalog' && !activeList && (
                <div className="selection-bar">
                    <div className="selection-bar-left">
                        <ShoppingCart size={17} />
                        <span>
                            {selection.size} {selection.size === 1 ? 'producto' : 'productos'} seleccionados
                        </span>
                    </div>
                    <div className="selection-bar-right">
                        <button className="selection-clear-btn" onClick={() => setSelection(new Map())}>
                            <X size={15} />
                        </button>
                        <button className="selection-create-btn" onClick={createList}>
                            Crear lista
                        </button>
                    </div>
                </div>
            )}

            {/* ══════════════ ADD STORE MODAL ═════════════════════ */}
            {showAddStore && (
                <div className="modal-overlay" onClick={() => setShowAddStore(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Nueva categoría</h3>
                            <button className="modal-close" onClick={() => setShowAddStore(false)}>
                                <X size={17} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p className="modal-label">Ícono</p>
                            <div className="emoji-picker">
                                {STORE_EMOJIS.map(e => (
                                    <button
                                        key={e}
                                        className={`emoji-btn ${newStoreEmoji === e ? 'active' : ''}`}
                                        onClick={() => setNewStoreEmoji(e)}
                                    >
                                        {e}
                                    </button>
                                ))}
                            </div>
                            <p className="modal-label">Nombre</p>
                            <input
                                className="modal-input"
                                type="text"
                                placeholder="Ej: Panadería, Farmacia..."
                                value={newStoreName}
                                onChange={e => setNewStoreName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addStore()}
                                autoFocus
                            />
                            <p className="modal-label">Color</p>
                            <div className="color-picker">
                                {STORE_COLORS.map(c => (
                                    <button
                                        key={c}
                                        className={`color-btn ${newStoreColor === c ? 'active' : ''}`}
                                        style={{ background: c }}
                                        onClick={() => setNewStoreColor(c)}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-ghost" onClick={() => setShowAddStore(false)}>Cancelar</button>
                            <button className="btn-primary" onClick={addStore} disabled={!newStoreName.trim()}>
                                Crear categoría
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════ IMPORT MODAL ════════════════════════ */}
            {showImport && (
                <div className="modal-overlay" onClick={closeImport}>
                    <div className="modal-box modal-box-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Importar productos a {activeStore?.name}</h3>
                            <button className="modal-close" onClick={closeImport}><X size={17} /></button>
                        </div>

                        {importStep !== 'preview' ? (
                            <>
                                <div className="import-tabs">
                                    <button
                                        className={`import-tab ${importStep === 'paste' || importStep === 'idle' ? 'active' : ''}`}
                                        onClick={() => setImportStep('paste')}
                                    >
                                        <FileText size={14} /> Pegar texto
                                    </button>
                                    <button
                                        className={`import-tab ${importStep === 'file' ? 'active' : ''}`}
                                        onClick={() => setImportStep('file')}
                                    >
                                        <Upload size={14} /> Archivo
                                    </button>
                                    <button className="import-tab import-tab-soon" disabled>
                                        <Camera size={14} /> Foto <span className="soon-badge">Pronto</span>
                                    </button>
                                </div>

                                <div className="modal-body">
                                    {(importStep === 'idle' || importStep === 'paste') && (
                                        <>
                                            <p className="import-hint">
                                                Un producto por línea. Puedes incluir cantidades: "2 kg arroz" o simplemente "leche"
                                            </p>
                                            <textarea
                                                className="import-textarea"
                                                placeholder={"Pollo\n2 kg arroz\n1 lt aceite de oliva\nSal\nPan de molde"}
                                                value={importText}
                                                onChange={e => setImportText(e.target.value)}
                                                rows={8}
                                                autoFocus
                                            />
                                        </>
                                    )}
                                    {importStep === 'file' && (
                                        <label className="file-drop" htmlFor="file-import-input">
                                            <Upload size={30} />
                                            <p>Sube un archivo <strong>.txt</strong> o <strong>.csv</strong></p>
                                            <span className="btn-primary">Seleccionar archivo</span>
                                            <input
                                                id="file-import-input"
                                                type="file"
                                                accept=".txt,.csv"
                                                onChange={handleFile}
                                                style={{ display: 'none' }}
                                            />
                                        </label>
                                    )}
                                </div>

                                {(importStep === 'paste' || importStep === 'idle') && importText.trim() && (
                                    <div className="modal-footer">
                                        <button className="btn-ghost" onClick={() => setImportText('')}>Limpiar</button>
                                        <button className="btn-primary" onClick={() => {
                                            setImportPreview(parseText(importText));
                                            setImportStep('preview');
                                        }}>
                                            Revisar lista →
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="modal-body">
                                    <p className="import-hint">
                                        Desmarca los que no quieras agregar. Ajusta la unidad si es necesario.
                                    </p>
                                    <div className="import-preview-list">
                                        {importPreview.map((item, i) => (
                                            <label key={i} className="import-preview-row">
                                                <input
                                                    type="checkbox"
                                                    checked={item.selected}
                                                    onChange={() =>
                                                        setImportPreview(prev =>
                                                            prev.map((p, j) => j === i ? { ...p, selected: !p.selected } : p)
                                                        )
                                                    }
                                                />
                                                <span className="import-preview-name">{item.name}</span>
                                                <select
                                                    className="import-preview-unit"
                                                    value={item.unit}
                                                    onChange={e =>
                                                        setImportPreview(prev =>
                                                            prev.map((p, j) => j === i ? { ...p, unit: e.target.value } : p)
                                                        )
                                                    }
                                                >
                                                    {UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
                                                </select>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button className="btn-ghost" onClick={() => setImportStep('paste')}>← Volver</button>
                                    <button
                                        className="btn-primary"
                                        onClick={importProducts}
                                        disabled={!importPreview.some(p => p.selected)}
                                    >
                                        Agregar {importPreview.filter(p => p.selected).length} al catálogo
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
