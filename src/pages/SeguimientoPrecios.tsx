import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    TrendingUp, TrendingDown, Minus, Plus, Trash2, X, Tag,
    AlertTriangle, ChevronDown, ShoppingBag,
} from 'lucide-react';
import './SeguimientoPrecios.css';

interface PriceItem {
    id: string;
    name: string;
    category: string | null;
    unit: string;
    created_at: string;
}

interface PriceEntry {
    id: string;
    item_id: string;
    price: number;
    store: string | null;
    date: string;
    notes: string | null;
}

interface ItemWithStats extends PriceItem {
    latestPrice: number | null;
    prevPrice: number | null;
    changePct: number | null;
    entryCount: number;
    minPrice: number | null;
    maxPrice: number | null;
    avgPrice: number | null;
    entries: PriceEntry[];
}

const CATEGORIES = ['Alimentos', 'Gasolina', 'Servicios', 'Tecnología', 'Ropa', 'Salud', 'Educación', 'Otro'];

const EMPTY_ITEM = { name: '', category: 'Alimentos', unit: 'unidad' };
const EMPTY_ENTRY = { price: '', store: '', date: format(new Date(), 'yyyy-MM-dd'), notes: '' };

export function SeguimientoPrecios() {
    const { user, profile } = useAuth();
    const currency = profile?.currency || 'COP';
    const [items, setItems] = useState<ItemWithStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<ItemWithStats | null>(null);
    const [showAddItem, setShowAddItem] = useState(false);
    const [showAddEntry, setShowAddEntry] = useState(false);
    const [itemForm, setItemForm] = useState({ ...EMPTY_ITEM });
    const [entryForm, setEntryForm] = useState({ ...EMPTY_ENTRY });
    const [saving, setSaving] = useState(false);
    const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
    const [filterCat, setFilterCat] = useState('all');
    const [alertPct, setAlertPct] = useState(15);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const [itemsRes, entriesRes] = await Promise.all([
            supabase.from('price_items').select('*').eq('user_id', user.id).order('name'),
            supabase.from('price_entries').select('*').eq('user_id', user.id).order('date', { ascending: false }),
        ]);
        const rawItems = itemsRes.data || [];
        const rawEntries = entriesRes.data || [];

        const result: ItemWithStats[] = rawItems.map(item => {
            const entries = rawEntries.filter(e => e.item_id === item.id);
            const prices = entries.map(e => Number(e.price));
            const latestPrice = prices[0] ?? null;
            const prevPrice = prices[1] ?? null;
            const changePct = latestPrice !== null && prevPrice !== null && prevPrice > 0
                ? ((latestPrice - prevPrice) / prevPrice) * 100 : null;
            return {
                ...item,
                latestPrice,
                prevPrice,
                changePct,
                entryCount: entries.length,
                minPrice: prices.length > 0 ? Math.min(...prices) : null,
                maxPrice: prices.length > 0 ? Math.max(...prices) : null,
                avgPrice: prices.length > 0 ? prices.reduce((s, p) => s + p, 0) / prices.length : null,
                entries,
            };
        });

        setItems(result);
        if (selected) {
            const updated = result.find(i => i.id === selected.id);
            if (updated) setSelected(updated);
        }
        setLoading(false);
    }, [user]);

    useEffect(() => { load(); }, [load]);

    async function handleAddItem() {
        if (!user || !itemForm.name.trim()) return;
        setSaving(true);
        await supabase.from('price_items').insert({
            user_id: user.id,
            name: itemForm.name.trim(),
            category: itemForm.category || null,
            unit: itemForm.unit || 'unidad',
        });
        setSaving(false);
        setShowAddItem(false);
        setItemForm({ ...EMPTY_ITEM });
        load();
    }

    async function handleAddEntry() {
        if (!user || !selected || !entryForm.price) return;
        setSaving(true);
        await supabase.from('price_entries').insert({
            user_id: user.id,
            item_id: selected.id,
            price: Number(entryForm.price),
            store: entryForm.store.trim() || null,
            date: entryForm.date,
            notes: entryForm.notes.trim() || null,
        });
        setSaving(false);
        setShowAddEntry(false);
        setEntryForm({ ...EMPTY_ENTRY });
        load();
    }

    async function handleDeleteItem(id: string) {
        await supabase.from('price_items').delete().eq('id', id);
        if (selected?.id === id) setSelected(null);
        setDeleteItemId(null);
        load();
    }

    async function handleDeleteEntry(id: string) {
        await supabase.from('price_entries').delete().eq('id', id);
        load();
    }

    function fmt(n: number) {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
    }

    const filtered = filterCat === 'all' ? items : items.filter(i => i.category === filterCat);
    const alertItems = items.filter(i => i.changePct !== null && i.changePct >= alertPct);
    const selectedEntries = selected?.entries || [];
    const maxEntryPrice = selectedEntries.length > 0 ? Math.max(...selectedEntries.map(e => e.price)) : 1;

    return (
        <div className="sp-page">
            {/* Alert banner */}
            {alertItems.length > 0 && (
                <div className="sp-alert-banner">
                    <AlertTriangle size={15} />
                    <span>{alertItems.length} producto{alertItems.length > 1 ? 's' : ''} con aumento ≥{alertPct}%: {alertItems.map(i => i.name).join(', ')}</span>
                    <div className="sp-alert-pct">
                        <span>Umbral:</span>
                        <input type="number" value={alertPct} min={1} max={100} onChange={e => setAlertPct(Number(e.target.value))} />
                        <span>%</span>
                    </div>
                </div>
            )}

            <div className="sp-layout">
                {/* Left panel */}
                <div className="sp-left">
                    <div className="sp-left-header">
                        <div className="sp-cat-filters">
                            <button type="button" className={`sp-filter-btn ${filterCat === 'all' ? 'active' : ''}`} onClick={() => setFilterCat('all')}>Todos</button>
                            {CATEGORIES.map(c => (
                                <button key={c} type="button" className={`sp-filter-btn ${filterCat === c ? 'active' : ''}`} onClick={() => setFilterCat(c)}>{c}</button>
                            ))}
                        </div>
                        <button type="button" className="sp-add-btn" onClick={() => setShowAddItem(true)}>
                            <Plus size={15} /> Producto
                        </button>
                    </div>

                    {loading ? (
                        <div className="sp-empty">Cargando...</div>
                    ) : filtered.length === 0 ? (
                        <div className="sp-empty">
                            <ShoppingBag size={36} strokeWidth={1.2} />
                            <p>Sin productos. Agrega uno para empezar.</p>
                        </div>
                    ) : (
                        <div className="sp-items">
                            {filtered.map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    className={`sp-item ${selected?.id === item.id ? 'selected' : ''} ${item.changePct !== null && item.changePct >= alertPct ? 'alert' : ''}`}
                                    onClick={() => setSelected(item)}
                                >
                                    <div className="sp-item-main">
                                        <span className="sp-item-name">{item.name}</span>
                                        <span className="sp-item-unit">{item.unit} · {item.category || 'Sin cat.'}</span>
                                    </div>
                                    <div className="sp-item-price">
                                        <strong>{item.latestPrice !== null ? fmt(item.latestPrice) : '—'}</strong>
                                        {item.changePct !== null && (
                                            <span className={`sp-change ${item.changePct > 0 ? 'up' : item.changePct < 0 ? 'down' : 'flat'}`}>
                                                {item.changePct > 0 ? <TrendingUp size={11} /> : item.changePct < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                                                {Math.abs(item.changePct).toFixed(1)}%
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right panel */}
                <div className="sp-right">
                    {!selected ? (
                        <div className="sp-right-empty">
                            <Tag size={40} strokeWidth={1.2} />
                            <p>Selecciona un producto para ver su historial</p>
                        </div>
                    ) : (
                        <>
                            <div className="sp-right-header">
                                <div>
                                    <h2 className="sp-right-title">{selected.name}</h2>
                                    <span className="sp-right-sub">{selected.category} · {selected.unit}</span>
                                </div>
                                <div className="sp-right-actions">
                                    <button type="button" className="sp-add-entry-btn" onClick={() => { setEntryForm({ ...EMPTY_ENTRY }); setShowAddEntry(true); }}>
                                        <Plus size={14} /> Registrar precio
                                    </button>
                                    <button type="button" className="sp-delete-item-btn" title="Eliminar producto" onClick={() => setDeleteItemId(selected.id)}>
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="sp-stats">
                                <div className="sp-stat">
                                    <span>Último</span>
                                    <strong>{selected.latestPrice !== null ? fmt(selected.latestPrice) : '—'}</strong>
                                </div>
                                <div className="sp-stat">
                                    <span>Mínimo</span>
                                    <strong className="green">{selected.minPrice !== null ? fmt(selected.minPrice) : '—'}</strong>
                                </div>
                                <div className="sp-stat">
                                    <span>Máximo</span>
                                    <strong className="red">{selected.maxPrice !== null ? fmt(selected.maxPrice) : '—'}</strong>
                                </div>
                                <div className="sp-stat">
                                    <span>Promedio</span>
                                    <strong>{selected.avgPrice !== null ? fmt(selected.avgPrice) : '—'}</strong>
                                </div>
                                <div className="sp-stat">
                                    <span>Variación</span>
                                    <strong className={selected.changePct !== null ? (selected.changePct > 0 ? 'red' : 'green') : ''}>
                                        {selected.changePct !== null ? `${selected.changePct > 0 ? '+' : ''}${selected.changePct.toFixed(1)}%` : '—'}
                                    </strong>
                                </div>
                                <div className="sp-stat">
                                    <span>Registros</span>
                                    <strong>{selected.entryCount}</strong>
                                </div>
                            </div>

                            {/* Mini bar chart */}
                            {selectedEntries.length > 1 && (
                                <div className="sp-chart">
                                    {[...selectedEntries].reverse().slice(-12).map(e => (
                                        <div key={e.id} className="sp-chart-col" title={`${fmt(e.price)} · ${format(parseISO(e.date), 'd MMM', { locale: es })}`}>
                                            <div className="sp-chart-bar" style={{ height: `${(e.price / maxEntryPrice) * 100}%` }} />
                                            <span className="sp-chart-lbl">{format(parseISO(e.date), 'dd/MM')}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Entry history */}
                            <div className="sp-history">
                                <h4>Historial de precios</h4>
                                {selectedEntries.length === 0 ? (
                                    <div className="sp-history-empty">Sin registros aún. Agrega el primer precio.</div>
                                ) : (
                                    <div className="sp-history-list">
                                        {selectedEntries.map((e, idx) => {
                                            const prev = selectedEntries[idx + 1];
                                            const diff = prev ? ((e.price - prev.price) / prev.price) * 100 : null;
                                            return (
                                                <div key={e.id} className="sp-entry-row">
                                                    <div className="sp-entry-date">{format(parseISO(e.date), 'd MMM yyyy', { locale: es })}</div>
                                                    <div className="sp-entry-info">
                                                        <strong className="sp-entry-price">{fmt(e.price)}</strong>
                                                        {e.store && <span className="sp-entry-store">{e.store}</span>}
                                                        {e.notes && <span className="sp-entry-notes">{e.notes}</span>}
                                                    </div>
                                                    {diff !== null && (
                                                        <span className={`sp-entry-diff ${diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'}`}>
                                                            {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                                                        </span>
                                                    )}
                                                    <button type="button" className="sp-entry-del" title="Eliminar" onClick={() => handleDeleteEntry(e.id)}>
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Add item modal */}
            {showAddItem && (
                <div className="sp-overlay" onClick={() => setShowAddItem(false)}>
                    <div className="sp-modal" onClick={e => e.stopPropagation()}>
                        <div className="sp-modal-header">
                            <h2>Nuevo producto</h2>
                            <button type="button" onClick={() => setShowAddItem(false)}><X size={20} /></button>
                        </div>
                        <div className="sp-modal-body">
                            <div className="sp-field">
                                <label>Nombre *</label>
                                <input type="text" value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Leche entera, Gasolina corriente..." />
                            </div>
                            <div className="sp-field-row">
                                <div className="sp-field">
                                    <label>Categoría</label>
                                    <div className="sp-select-wrap">
                                        <select value={itemForm.category} onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))}>
                                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                        <ChevronDown size={14} className="sp-chevron" />
                                    </div>
                                </div>
                                <div className="sp-field">
                                    <label>Unidad</label>
                                    <input type="text" value={itemForm.unit} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))} placeholder="litro, kg, unidad..." />
                                </div>
                            </div>
                        </div>
                        <div className="sp-modal-footer">
                            <button type="button" className="sp-btn-cancel" onClick={() => setShowAddItem(false)}>Cancelar</button>
                            <button type="button" className="sp-btn-save" onClick={handleAddItem} disabled={saving || !itemForm.name.trim()}>
                                {saving ? 'Guardando...' : 'Crear producto'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add entry modal */}
            {showAddEntry && selected && (
                <div className="sp-overlay" onClick={() => setShowAddEntry(false)}>
                    <div className="sp-modal" onClick={e => e.stopPropagation()}>
                        <div className="sp-modal-header">
                            <h2>Registrar precio · {selected.name}</h2>
                            <button type="button" onClick={() => setShowAddEntry(false)}><X size={20} /></button>
                        </div>
                        <div className="sp-modal-body">
                            <div className="sp-field-row">
                                <div className="sp-field">
                                    <label>Precio *</label>
                                    <input type="number" min="0" step="any" value={entryForm.price} onChange={e => setEntryForm(f => ({ ...f, price: e.target.value }))} placeholder="0" autoFocus />
                                </div>
                                <div className="sp-field">
                                    <label>Fecha</label>
                                    <input type="date" value={entryForm.date} onChange={e => setEntryForm(f => ({ ...f, date: e.target.value }))} />
                                </div>
                            </div>
                            <div className="sp-field">
                                <label>Tienda / Lugar</label>
                                <input type="text" value={entryForm.store} onChange={e => setEntryForm(f => ({ ...f, store: e.target.value }))} placeholder="Ej: Éxito, Olímpica, Terpel..." />
                            </div>
                            <div className="sp-field">
                                <label>Notas</label>
                                <input type="text" value={entryForm.notes} onChange={e => setEntryForm(f => ({ ...f, notes: e.target.value }))} placeholder="Oferta, presentación, etc." />
                            </div>
                            {selected.latestPrice !== null && entryForm.price && (
                                <div className={`sp-entry-preview ${Number(entryForm.price) > selected.latestPrice ? 'up' : 'down'}`}>
                                    {Number(entryForm.price) > selected.latestPrice
                                        ? <TrendingUp size={14} />
                                        : <TrendingDown size={14} />}
                                    <span>
                                        Precio anterior: {fmt(selected.latestPrice)} →
                                        variación: {((Number(entryForm.price) - selected.latestPrice) / selected.latestPrice * 100).toFixed(1)}%
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="sp-modal-footer">
                            <button type="button" className="sp-btn-cancel" onClick={() => setShowAddEntry(false)}>Cancelar</button>
                            <button type="button" className="sp-btn-save" onClick={handleAddEntry} disabled={saving || !entryForm.price}>
                                {saving ? 'Guardando...' : 'Registrar precio'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirm */}
            {deleteItemId && (
                <div className="sp-overlay" onClick={() => setDeleteItemId(null)}>
                    <div className="sp-confirm" onClick={e => e.stopPropagation()}>
                        <AlertTriangle size={28} className="sp-confirm-icon" />
                        <p>¿Eliminar este producto y todo su historial?</p>
                        <div className="sp-confirm-btns">
                            <button type="button" onClick={() => setDeleteItemId(null)}>Cancelar</button>
                            <button type="button" className="danger" onClick={() => handleDeleteItem(deleteItemId)}>Eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
