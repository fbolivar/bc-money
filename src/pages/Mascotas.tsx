import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Plus, Edit2, Trash2, X, Search, AlertTriangle, Clock, ChevronDown, ChevronUp,
    Dog, Cat, Bird, Fish, Rabbit, Bug, type LucideIcon,
    Syringe, Stethoscope, Scissors, Pill, Heart, ShoppingBag, Shield, Package,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Pet, PetEvent } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, differenceInDays, differenceInYears, differenceInMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import './Mascotas.css';

const SPECIES: { value: Pet['species']; label: string; icon: LucideIcon }[] = [
    { value: 'dog', label: 'Perro', icon: Dog },
    { value: 'cat', label: 'Gato', icon: Cat },
    { value: 'bird', label: 'Ave', icon: Bird },
    { value: 'fish', label: 'Pez', icon: Fish },
    { value: 'rabbit', label: 'Conejo', icon: Rabbit },
    { value: 'hamster', label: 'Hámster', icon: Bug },
    { value: 'reptile', label: 'Reptil', icon: Bug },
    { value: 'other', label: 'Otro', icon: Package },
];
const SPECIES_LABELS = Object.fromEntries(SPECIES.map(s => [s.value, s.label]));
const SPECIES_ICONS: Record<string, LucideIcon> = Object.fromEntries(SPECIES.map(s => [s.value, s.icon]));

const EVENT_TYPES: { value: PetEvent['type']; label: string; icon: LucideIcon }[] = [
    { value: 'vaccine', label: 'Vacuna', icon: Syringe },
    { value: 'vet_visit', label: 'Visita Veterinaria', icon: Stethoscope },
    { value: 'grooming', label: 'Peluquería', icon: Scissors },
    { value: 'medication', label: 'Medicamento', icon: Pill },
    { value: 'surgery', label: 'Cirugía', icon: Heart },
    { value: 'food', label: 'Alimentación', icon: ShoppingBag },
    { value: 'accessory', label: 'Accesorio', icon: Package },
    { value: 'insurance', label: 'Seguro', icon: Shield },
    { value: 'other', label: 'Otro', icon: Package },
];
const EVT_LABELS = Object.fromEntries(EVENT_TYPES.map(e => [e.value, e.label]));
const EVT_ICONS: Record<string, LucideIcon> = Object.fromEntries(EVENT_TYPES.map(e => [e.value, e.icon]));

const COLORS = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#64748B'];

function fmt(n: number, c: string) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: c, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n); }

function petAge(birthDate: string | null) {
    if (!birthDate) return '';
    const b = new Date(birthDate);
    const y = differenceInYears(new Date(), b);
    if (y >= 1) return `${y} año${y > 1 ? 's' : ''}`;
    const m = differenceInMonths(new Date(), b);
    return `${m} mes${m !== 1 ? 'es' : ''}`;
}

export function Mascotas() {
    const { user, profile } = useAuth();
    const [pets, setPets] = useState<Pet[]>([]);
    const [events, setEvents] = useState<PetEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isPetModal, setIsPetModal] = useState(false);
    const [isEventModal, setIsEventModal] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'pet' | 'event'; item: Pet | PetEvent } | null>(null);
    const [editingPet, setEditingPet] = useState<Pet | null>(null);
    const [editingEvent, setEditingEvent] = useState<PetEvent | null>(null);
    const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
    const [expandedPet, setExpandedPet] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const currency = profile?.currency || 'COP';

    const [petForm, setPetForm] = useState({ name: '', species: 'dog' as Pet['species'], breed: '', birth_date: '', weight: '', color: '#F59E0B', notes: '' });
    const [eventForm, setEventForm] = useState({ pet_id: '', type: 'vaccine' as PetEvent['type'], name: '', date: format(new Date(), 'yyyy-MM-dd'), next_date: '', cost: '', veterinary: '', notes: '' });

    const showToast = useCallback((msg: string, type: 'success' | 'error') => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 3000); }, []);

    const fetchData = useCallback(async () => {
        if (!user) return;
        const [pRes, eRes] = await Promise.all([
            supabase.from('pets').select('*').eq('user_id', user.id).order('name'),
            supabase.from('pet_events').select('*').eq('user_id', user.id).order('date', { ascending: false }),
        ]);
        setPets(pRes.data || []);
        setEvents(eRes.data || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

    const filtered = useMemo(() => {
        if (!searchTerm) return pets;
        const t = searchTerm.toLowerCase();
        return pets.filter(p => p.name.toLowerCase().includes(t) || (p.breed || '').toLowerCase().includes(t));
    }, [pets, searchTerm]);

    // Upcoming events (next_date within 14 days)
    const alerts = useMemo(() => events.filter(e => {
        if (!e.next_date) return false;
        const days = differenceInDays(new Date(e.next_date), new Date());
        return days >= 0 && days <= 14;
    }), [events]);

    const totalSpent = useMemo(() => events.reduce((s, e) => s + (e.cost || 0), 0), [events]);

    // Pet CRUD
    async function handlePetSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || saving) return;
        setSaving(true);
        try {
            const data = {
                user_id: user.id, name: petForm.name, species: petForm.species,
                breed: petForm.breed || null, birth_date: petForm.birth_date || null,
                weight: petForm.weight ? parseFloat(petForm.weight) : null,
                color: petForm.color, notes: petForm.notes || null,
            };
            if (editingPet) { await supabase.from('pets').update(data).eq('id', editingPet.id); showToast('Mascota actualizada', 'success'); }
            else { await supabase.from('pets').insert(data); showToast('Mascota registrada', 'success'); }
            setIsPetModal(false); setEditingPet(null);
            setPetForm({ name: '', species: 'dog', breed: '', birth_date: '', weight: '', color: '#F59E0B', notes: '' });
            fetchData();
        } catch { showToast('Error al guardar', 'error'); }
        finally { setSaving(false); }
    }

    // Event CRUD
    async function handleEventSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || saving) return;
        setSaving(true);
        try {
            const data = {
                pet_id: eventForm.pet_id, user_id: user.id, type: eventForm.type,
                name: eventForm.name, date: eventForm.date,
                next_date: eventForm.next_date || null, cost: eventForm.cost ? parseFloat(eventForm.cost) : null,
                currency, veterinary: eventForm.veterinary || null, notes: eventForm.notes || null,
            };
            if (editingEvent) { await supabase.from('pet_events').update(data).eq('id', editingEvent.id); showToast('Evento actualizado', 'success'); }
            else { await supabase.from('pet_events').insert(data); showToast('Evento registrado', 'success'); }
            setIsEventModal(false); setEditingEvent(null);
            setEventForm({ pet_id: '', type: 'vaccine', name: '', date: format(new Date(), 'yyyy-MM-dd'), next_date: '', cost: '', veterinary: '', notes: '' });
            fetchData();
        } catch { showToast('Error al guardar', 'error'); }
        finally { setSaving(false); }
    }

    async function handleDelete() {
        if (!deleteConfirm) return;
        try {
            if (deleteConfirm.type === 'pet') await supabase.from('pets').delete().eq('id', deleteConfirm.item.id);
            else await supabase.from('pet_events').delete().eq('id', deleteConfirm.item.id);
            setDeleteConfirm(null);
            showToast('Eliminado correctamente', 'success');
            fetchData();
        } catch { showToast('Error al eliminar', 'error'); setDeleteConfirm(null); }
    }

    function openEditPet(p: Pet) {
        setEditingPet(p);
        setPetForm({ name: p.name, species: p.species, breed: p.breed || '', birth_date: p.birth_date || '', weight: p.weight?.toString() || '', color: p.color, notes: p.notes || '' });
        setIsPetModal(true);
    }

    function openEditEvent(ev: PetEvent) {
        setEditingEvent(ev);
        setEventForm({ pet_id: ev.pet_id, type: ev.type, name: ev.name, date: ev.date, next_date: ev.next_date || '', cost: ev.cost?.toString() || '', veterinary: ev.veterinary || '', notes: ev.notes || '' });
        setIsEventModal(true);
    }

    function openNewEvent(petId: string) {
        setEditingEvent(null);
        setEventForm({ pet_id: petId, type: 'vaccine', name: '', date: format(new Date(), 'yyyy-MM-dd'), next_date: '', cost: '', veterinary: '', notes: '' });
        setIsEventModal(true);
    }

    if (loading) return <div className="loading-screen">Cargando...</div>;

    return (
        <div className="mascotas-container">
            {toast && <div className={`pet-toast ${toast.type}`}>{toast.message}</div>}

            {/* Alerts */}
            {alerts.length > 0 && (
                <div className="pet-alerts">
                    {alerts.map(ev => {
                        const pet = pets.find(p => p.id === ev.pet_id);
                        const days = differenceInDays(new Date(ev.next_date!), new Date());
                        return (
                            <div key={ev.id} className={`pet-alert ${days <= 3 ? 'urgent' : ''}`}>
                                <Clock size={16} />
                                <span><strong>{pet?.name}</strong> — {ev.name} {days === 0 ? 'hoy' : `en ${days} día${days > 1 ? 's' : ''}`}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="mascotas-header">
                <div><h1>Mascotas</h1><p>Seguimiento de gastos veterinarios, vacunas y cuidados</p></div>
            </div>

            {/* Summary */}
            <div className="mascotas-summary">
                <div className="ms-card"><span className="ms-num">{pets.length}</span><span className="ms-label">Mascotas</span></div>
                <div className="ms-card"><span className="ms-num">{events.length}</span><span className="ms-label">Eventos</span></div>
                <div className="ms-card"><span className="ms-num">{alerts.length}</span><span className="ms-label">Próximos</span></div>
                <div className="ms-card total"><span className="ms-num">{fmt(totalSpent, currency)}</span><span className="ms-label">Gasto Total</span></div>
            </div>

            {/* Search */}
            <div className="mascotas-search">
                <Search size={18} className="search-icon" />
                <input type="text" placeholder="Buscar mascotas..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
            </div>

            {/* Pets */}
            {filtered.length === 0 ? (
                <div className="mascotas-empty">
                    <Dog size={48} />
                    <h3>No tienes mascotas registradas</h3>
                    <p>Agrega tu primera mascota para llevar control de sus cuidados</p>
                    <button type="button" className="empty-add-btn" onClick={() => { setEditingPet(null); setIsPetModal(true); }}><Plus size={20} /> Agregar Mascota</button>
                </div>
            ) : (
                <div className="pets-list">
                    {filtered.map(pet => {
                        const Icon = SPECIES_ICONS[pet.species] || Dog;
                        const petEvents = events.filter(e => e.pet_id === pet.id);
                        const petCost = petEvents.reduce((s, e) => s + (e.cost || 0), 0);
                        const isExpanded = expandedPet === pet.id;

                        return (
                            <div key={pet.id} className="pet-card">
                                <div className="pet-card-main" onClick={() => setExpandedPet(isExpanded ? null : pet.id)}>
                                    <div className="pet-icon" style={{ backgroundColor: `${pet.color}20`, color: pet.color }}>
                                        <Icon size={28} />
                                    </div>
                                    <div className="pet-info">
                                        <h3>{pet.name}</h3>
                                        <span className="pet-meta">
                                            {SPECIES_LABELS[pet.species]}{pet.breed ? ` · ${pet.breed}` : ''}{pet.birth_date ? ` · ${petAge(pet.birth_date)}` : ''}
                                            {pet.weight ? ` · ${pet.weight}kg` : ''}
                                        </span>
                                    </div>
                                    <div className="pet-cost">{fmt(petCost, currency)}</div>
                                    <div className="pet-card-actions">
                                        <button type="button" title="Agregar evento" className="pc-btn add" onClick={e => { e.stopPropagation(); openNewEvent(pet.id); }}><Plus size={14} /></button>
                                        <button type="button" title="Editar" className="pc-btn" onClick={e => { e.stopPropagation(); openEditPet(pet); }}><Edit2 size={14} /></button>
                                        <button type="button" title="Eliminar" className="pc-btn del" onClick={e => { e.stopPropagation(); setDeleteConfirm({ type: 'pet', item: pet }); }}><Trash2 size={14} /></button>
                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="pet-events">
                                        {petEvents.length === 0 ? (
                                            <p className="no-events">Sin eventos registrados</p>
                                        ) : petEvents.map(ev => {
                                            const EvIcon = EVT_ICONS[ev.type] || Package;
                                            return (
                                                <div key={ev.id} className="event-row">
                                                    <EvIcon size={16} className="ev-icon" />
                                                    <div className="ev-info">
                                                        <span className="ev-name">{ev.name}</span>
                                                        <span className="ev-meta">{EVT_LABELS[ev.type]} · {format(new Date(ev.date), 'd MMM yyyy', { locale: es })}{ev.veterinary ? ` · ${ev.veterinary}` : ''}</span>
                                                        {ev.next_date && <span className="ev-next">Próximo: {format(new Date(ev.next_date), 'd MMM yyyy', { locale: es })}</span>}
                                                    </div>
                                                    {ev.cost && <span className="ev-cost">{fmt(ev.cost, ev.currency)}</span>}
                                                    <div className="ev-actions">
                                                        <button type="button" title="Editar" className="pc-btn" onClick={() => openEditEvent(ev)}><Edit2 size={12} /></button>
                                                        <button type="button" title="Eliminar" className="pc-btn del" onClick={() => setDeleteConfirm({ type: 'event', item: ev })}><Trash2 size={12} /></button>
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

            {/* FAB */}
            <button type="button" className="fab-add" onClick={() => { setEditingPet(null); setPetForm({ name: '', species: 'dog', breed: '', birth_date: '', weight: '', color: '#F59E0B', notes: '' }); setIsPetModal(true); }}>
                <Plus size={20} /> Mascota
            </button>

            {/* Modal Pet */}
            {isPetModal && (
                <div className="modal-overlay" onClick={() => setIsPetModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h2>{editingPet ? 'Editar Mascota' : 'Nueva Mascota'}</h2><button type="button" className="close-btn" title="Cerrar" onClick={() => setIsPetModal(false)}><X size={20} /></button></div>
                        <form onSubmit={handlePetSubmit} className="modal-form">
                            <div className="form-group"><label>Nombre</label><input type="text" className="form-input" value={petForm.name} onChange={e => setPetForm({ ...petForm, name: e.target.value })} required placeholder="Ej: Luna" /></div>
                            <div className="form-row two-cols">
                                <div className="form-group"><label>Especie</label><select className="form-select" title="Especie" value={petForm.species} onChange={e => setPetForm({ ...petForm, species: e.target.value as Pet['species'] })}>{SPECIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
                                <div className="form-group"><label>Raza</label><input type="text" className="form-input" value={petForm.breed} onChange={e => setPetForm({ ...petForm, breed: e.target.value })} placeholder="Ej: Golden Retriever" /></div>
                            </div>
                            <div className="form-row two-cols">
                                <div className="form-group"><label>Fecha de Nacimiento</label><input type="date" className="form-input" value={petForm.birth_date} onChange={e => setPetForm({ ...petForm, birth_date: e.target.value })} /></div>
                                <div className="form-group"><label>Peso (kg)</label><input type="number" className="form-input" value={petForm.weight} onChange={e => setPetForm({ ...petForm, weight: e.target.value })} min="0" step="0.1" /></div>
                            </div>
                            <div className="form-group"><label>Color</label><div className="color-grid">{COLORS.map(c => <button key={c} type="button" title={c} className={`color-swatch ${petForm.color === c ? 'selected' : ''}`} style={{ backgroundColor: c }} onClick={() => setPetForm({ ...petForm, color: c })} />)}</div></div>
                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsPetModal(false)}>Cancelar</button>
                                <button type="submit" className="btn-submit" disabled={saving}>{saving ? 'Guardando...' : editingPet ? 'Guardar' : 'Crear'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Event */}
            {isEventModal && (
                <div className="modal-overlay" onClick={() => setIsEventModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h2>{editingEvent ? 'Editar Evento' : 'Nuevo Evento'}</h2><button type="button" className="close-btn" title="Cerrar" onClick={() => setIsEventModal(false)}><X size={20} /></button></div>
                        <form onSubmit={handleEventSubmit} className="modal-form">
                            <div className="form-group"><label>Mascota</label><select className="form-select" title="Mascota" value={eventForm.pet_id} onChange={e => setEventForm({ ...eventForm, pet_id: e.target.value })} required>{pets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                            <div className="form-row two-cols">
                                <div className="form-group"><label>Tipo</label><select className="form-select" title="Tipo" value={eventForm.type} onChange={e => setEventForm({ ...eventForm, type: e.target.value as PetEvent['type'] })}>{EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                                <div className="form-group"><label>Nombre</label><input type="text" className="form-input" value={eventForm.name} onChange={e => setEventForm({ ...eventForm, name: e.target.value })} required placeholder="Ej: Rabia" /></div>
                            </div>
                            <div className="form-row two-cols">
                                <div className="form-group"><label>Fecha</label><input type="date" className="form-input" value={eventForm.date} onChange={e => setEventForm({ ...eventForm, date: e.target.value })} required /></div>
                                <div className="form-group"><label>Próxima Fecha</label><input type="date" className="form-input" value={eventForm.next_date} onChange={e => setEventForm({ ...eventForm, next_date: e.target.value })} /></div>
                            </div>
                            <div className="form-row two-cols">
                                <div className="form-group"><label>Costo</label><input type="number" className="form-input" value={eventForm.cost} onChange={e => setEventForm({ ...eventForm, cost: e.target.value })} min="0" step="0.01" /></div>
                                <div className="form-group"><label>Veterinaria</label><input type="text" className="form-input" value={eventForm.veterinary} onChange={e => setEventForm({ ...eventForm, veterinary: e.target.value })} placeholder="Ej: PetVet" /></div>
                            </div>
                            <div className="form-group"><label>Notas</label><input type="text" className="form-input" value={eventForm.notes} onChange={e => setEventForm({ ...eventForm, notes: e.target.value })} placeholder="Opcional" /></div>
                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsEventModal(false)}>Cancelar</button>
                                <button type="submit" className="btn-submit" disabled={saving}>{saving ? 'Guardando...' : editingEvent ? 'Guardar' : 'Crear'}</button>
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
                        <h2>¿Eliminar {deleteConfirm.type === 'pet' ? `"${(deleteConfirm.item as Pet).name}"` : 'este evento'}?</h2>
                        <p>{deleteConfirm.type === 'pet' ? 'Se eliminarán todos los eventos asociados.' : 'Esta acción no se puede deshacer.'}</p>
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
