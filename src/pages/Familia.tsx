import { useState, useEffect, useCallback } from 'react';
import {
    Plus, Trash2, X, Users, Crown, Shield, Eye, UserPlus, CheckCircle, Mail, Save,
    ArrowLeftRight, Landmark, Wallet, Target, CircleDollarSign, Repeat, BarChart3,
    ShieldCheck, PawPrint, ShoppingCart, Hammer, TrendingUp, CalendarDays, FileText,
    type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Family, FamilyMember } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import './Familia.css';

const ROLE_LABELS: Record<string, string> = { owner: 'Propietario', admin: 'Administrador', member: 'Miembro', viewer: 'Solo lectura' };
const ROLE_ICONS: Record<string, typeof Crown> = { owner: Crown, admin: Shield, member: Users, viewer: Eye };

interface ShareableModule {
    key: string;
    label: string;
    icon: LucideIcon;
    desc: string;
}

const ALL_MODULES: ShareableModule[] = [
    { key: 'transactions', label: 'Transacciones', icon: ArrowLeftRight, desc: 'Ingresos y gastos' },
    { key: 'accounts', label: 'Cuentas', icon: Landmark, desc: 'Cuentas bancarias y saldos' },
    { key: 'budgets', label: 'Presupuestos', icon: Wallet, desc: 'Límites de gasto por categoría' },
    { key: 'goals', label: 'Metas', icon: Target, desc: 'Objetivos de ahorro' },
    { key: 'debts', label: 'Deudas', icon: CircleDollarSign, desc: 'Préstamos y pagos' },
    { key: 'subscriptions', label: 'Suscripciones', icon: Repeat, desc: 'Pagos recurrentes' },
    { key: 'investments', label: 'Inversiones', icon: BarChart3, desc: 'Portfolio y rendimiento' },
    { key: 'warranties', label: 'Garantías', icon: ShieldCheck, desc: 'Productos y vencimientos' },
    { key: 'pets', label: 'Mascotas', icon: PawPrint, desc: 'Gastos veterinarios' },
    { key: 'shopping', label: 'Compras', icon: ShoppingCart, desc: 'Listas de compras' },
    { key: 'home', label: 'Hogar', icon: Hammer, desc: 'Mantenimiento del hogar' },
    { key: 'networth', label: 'Patrimonio', icon: TrendingUp, desc: 'Activos vs pasivos' },
    { key: 'calendar', label: 'Calendario', icon: CalendarDays, desc: 'Eventos financieros' },
    { key: 'reports', label: 'Reportes', icon: FileText, desc: 'Informes y exportaciones' },
];

export function Familia() {
    const { user, profile, refreshProfile } = useAuth();
    const [family, setFamily] = useState<Family | null>(null);
    const [members, setMembers] = useState<(FamilyMember & { email?: string; full_name?: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModal, setIsCreateModal] = useState(false);
    const [isInviteModal, setIsInviteModal] = useState(false);
    const [familyName, setFamilyName] = useState('');
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');
    const [sharedModules, setSharedModules] = useState<string[]>(['budgets', 'goals', 'reports']);
    const [savingModules, setSavingModules] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const showToast = useCallback((msg: string, type: 'success' | 'error') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }, []);

    const fetchData = useCallback(async () => {
        if (!user) return;
        if (profile?.family_id) {
            const { data: fam } = await supabase.from('families').select('*').eq('id', profile.family_id).single();
            setFamily(fam);
            if (fam) {
                setSharedModules(fam.shared_modules || ['budgets', 'goals', 'reports']);
                const { data: mems } = await supabase.from('family_members').select('*').eq('family_id', fam.id);
                const enriched = [];
                for (const m of (mems || [])) {
                    const { data: p } = await supabase.from('profiles').select('email,full_name').eq('id', m.user_id).single();
                    enriched.push({ ...m, email: p?.email || m.invited_email || '', full_name: p?.full_name || '' });
                }
                setMembers(enriched);
            }
        } else {
            const { data: pending } = await supabase.from('family_members').select('*').eq('user_id', user.id).eq('status', 'pending');
            if (pending && pending.length > 0) {
                const inv = pending[0];
                const { data: fam } = await supabase.from('families').select('*').eq('id', inv.family_id).single();
                if (fam) { setFamily(fam); setSharedModules(fam.shared_modules || []); }
                setMembers([{ ...inv, email: user.email || '', full_name: profile?.full_name || '' }]);
            }
        }
        setLoading(false);
    }, [user, profile]);

    useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

    const isOwner = family && family.owner_id === user?.id;

    async function createFamily(e: React.FormEvent) {
        e.preventDefault();
        if (!user || !familyName.trim()) return;
        try {
            const { data: fam, error: e1 } = await supabase.from('families').insert({ name: familyName, owner_id: user.id, shared_modules: sharedModules }).select();
            if (e1 || !fam || fam.length === 0) { showToast(`Error: ${e1?.message || 'No se pudo crear'}`, 'error'); return; }
            const familyId = fam[0].id;
            await supabase.from('family_members').insert({ family_id: familyId, user_id: user.id, role: 'owner', status: 'active' });
            await supabase.from('profiles').update({ family_id: familyId }).eq('id', user.id);
            setIsCreateModal(false); setFamilyName('');
            showToast('Familia creada', 'success');
            await refreshProfile(); fetchData();
        } catch { showToast('Error inesperado', 'error'); }
    }

    async function saveSharedModules() {
        if (!family) return;
        setSavingModules(true);
        await supabase.from('families').update({ shared_modules: sharedModules }).eq('id', family.id);
        setSavingModules(false);
        showToast('Módulos compartidos actualizados', 'success');
    }

    function toggleModule(key: string) {
        setSharedModules(prev => prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]);
    }

    async function inviteMember(e: React.FormEvent) {
        e.preventDefault();
        if (!family || !inviteEmail.trim()) return;
        const { data: targetProfile } = await supabase.from('profiles').select('id').eq('email', inviteEmail.trim()).single();
        if (!targetProfile) { showToast('No se encontró un usuario con ese email', 'error'); return; }
        if (members.find(m => m.user_id === targetProfile.id)) { showToast('Ya es miembro', 'error'); return; }
        const { error } = await supabase.from('family_members').insert({ family_id: family.id, user_id: targetProfile.id, role: inviteRole, invited_email: inviteEmail.trim(), status: 'pending' });
        if (error) { showToast('Error al invitar', 'error'); return; }
        await supabase.from('profiles').update({ family_id: family.id }).eq('id', targetProfile.id);
        setIsInviteModal(false); setInviteEmail('');
        showToast('Invitación enviada', 'success'); fetchData();
    }

    async function acceptInvitation() {
        if (!user || !family) return;
        await supabase.from('family_members').update({ status: 'active' }).eq('family_id', family.id).eq('user_id', user.id);
        showToast('Te uniste a la familia', 'success');
        await refreshProfile(); fetchData();
    }

    async function removeMember(memberId: string, userId: string) {
        if (!confirm('¿Eliminar este miembro?')) return;
        await supabase.from('family_members').delete().eq('id', memberId);
        await supabase.from('profiles').update({ family_id: null }).eq('id', userId);
        showToast('Miembro eliminado', 'success'); fetchData();
    }

    async function leaveFamily() {
        if (!user || !family || !confirm('¿Salir de esta familia?')) return;
        await supabase.from('family_members').delete().eq('family_id', family.id).eq('user_id', user.id);
        await supabase.from('profiles').update({ family_id: null }).eq('id', user.id);
        showToast('Has salido de la familia', 'success');
        setFamily(null); setMembers([]);
        await refreshProfile();
    }

    if (loading) return <div className="loading-container"><div className="loading-spinner"></div></div>;

    return (
        <div className="familia-page animate-fadeIn">
            {toast && <div className={`fam-toast ${toast.type}`}>{toast.msg}</div>}
            <div className="fam-header"><div><h1>Familia</h1><p>Comparte módulos financieros con tu familia</p></div></div>

            {!family ? (
                <div className="fam-empty">
                    <Users size={56} />
                    <h3>No perteneces a ninguna familia</h3>
                    <p>Crea una familia y selecciona qué módulos compartir</p>
                    <button type="button" className="btn btn-primary" onClick={() => setIsCreateModal(true)}><Plus size={16} /> Crear Familia</button>
                </div>
            ) : (
                <>
                    <div className="fam-info-card">
                        <div className="fam-info-header">
                            <Users size={28} />
                            <div><h2>{family.name}</h2><span>{members.length} miembro{members.length !== 1 ? 's' : ''} · {sharedModules.length} módulos compartidos</span></div>
                        </div>
                        <div className="fam-info-actions">
                            {isOwner && <button type="button" className="btn btn-primary" onClick={() => setIsInviteModal(true)}><UserPlus size={16} /> Invitar</button>}
                            {!isOwner && <button type="button" className="btn btn-secondary" onClick={leaveFamily}>Salir</button>}
                        </div>
                    </div>

                    {members.some(m => m.user_id === user?.id && m.status === 'pending') && (
                        <div className="fam-pending"><Mail size={20} /><span>Tienes una invitación pendiente</span>
                            <button type="button" className="btn btn-primary" onClick={acceptInvitation}><CheckCircle size={16} /> Aceptar</button>
                        </div>
                    )}

                    {/* Shared Modules Selection */}
                    {isOwner && (
                        <div className="fam-modules-card">
                            <div className="fam-modules-header">
                                <h3>Módulos Compartidos</h3>
                                <button type="button" className="btn btn-primary btn-sm" onClick={saveSharedModules} disabled={savingModules}>
                                    <Save size={14} /> {savingModules ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                            <p className="fam-modules-desc">Selecciona qué módulos pueden ver los miembros de tu familia</p>
                            <div className="fam-modules-grid">
                                {ALL_MODULES.map(mod => (
                                    <button key={mod.key} type="button"
                                        className={`fam-module-btn ${sharedModules.includes(mod.key) ? 'active' : ''}`}
                                        onClick={() => toggleModule(mod.key)}>
                                        <mod.icon size={20} />
                                        <div className="fam-mod-info">
                                            <strong>{mod.label}</strong>
                                            <span>{mod.desc}</span>
                                        </div>
                                        <div className={`fam-mod-check ${sharedModules.includes(mod.key) ? 'on' : ''}`}>
                                            {sharedModules.includes(mod.key) && <CheckCircle size={16} />}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* View shared modules for non-owners */}
                    {!isOwner && sharedModules.length > 0 && (
                        <div className="fam-modules-card">
                            <h3>Módulos Compartidos Contigo</h3>
                            <div className="fam-modules-grid">
                                {ALL_MODULES.filter(m => sharedModules.includes(m.key)).map(mod => (
                                    <div key={mod.key} className="fam-module-btn active readonly">
                                        <mod.icon size={20} />
                                        <div className="fam-mod-info"><strong>{mod.label}</strong><span>{mod.desc}</span></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Members */}
                    <div className="fam-members">
                        <h3>Miembros</h3>
                        {members.map(m => {
                            const Icon = ROLE_ICONS[m.role] || Users;
                            return (
                                <div key={m.id} className={`fam-member ${m.status === 'pending' ? 'pending' : ''}`}>
                                    <div className="fam-member-avatar">{(m.full_name || m.email)?.[0]?.toUpperCase() || '?'}</div>
                                    <div className="fam-member-info">
                                        <span className="fam-member-name">{m.full_name || m.email}</span>
                                        <span className="fam-member-role"><Icon size={12} /> {ROLE_LABELS[m.role]}{m.status === 'pending' ? ' (pendiente)' : ''}</span>
                                    </div>
                                    {isOwner && m.role !== 'owner' && (
                                        <button type="button" className="fam-remove-btn" title="Eliminar" onClick={() => removeMember(m.id, m.user_id)}><Trash2 size={14} /></button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* Create Modal */}
            {isCreateModal && (
                <div className="modal-overlay" onClick={() => setIsCreateModal(false)}>
                    <div className="fam-modal" onClick={e => e.stopPropagation()}>
                        <div className="fam-modal-header"><h2>Crear Familia</h2><button type="button" title="Cerrar" onClick={() => setIsCreateModal(false)}><X size={18} /></button></div>
                        <form onSubmit={createFamily} className="fam-modal-form">
                            <div className="form-group"><label>Nombre</label><input type="text" className="form-input" value={familyName} onChange={e => setFamilyName(e.target.value)} required placeholder="Ej: Familia García" /></div>

                            <div className="form-group">
                                <label>Módulos a compartir</label>
                                <div className="fam-modal-modules">
                                    {ALL_MODULES.map(mod => (
                                        <label key={mod.key} className="fam-modal-mod-label">
                                            <input type="checkbox" checked={sharedModules.includes(mod.key)} onChange={() => toggleModule(mod.key)} />
                                            <mod.icon size={14} />
                                            <span>{mod.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsCreateModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Crear</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Invite Modal */}
            {isInviteModal && (
                <div className="modal-overlay" onClick={() => setIsInviteModal(false)}>
                    <div className="fam-modal" onClick={e => e.stopPropagation()}>
                        <div className="fam-modal-header"><h2>Invitar Miembro</h2><button type="button" title="Cerrar" onClick={() => setIsInviteModal(false)}><X size={18} /></button></div>
                        <form onSubmit={inviteMember} className="fam-modal-form">
                            <div className="form-group"><label>Email</label><input type="email" className="form-input" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required placeholder="email@ejemplo.com" /></div>
                            <div className="form-group"><label>Rol</label>
                                <select className="form-select" value={inviteRole} onChange={e => setInviteRole(e.target.value as typeof inviteRole)} title="Rol">
                                    <option value="admin">Administrador</option>
                                    <option value="member">Miembro</option>
                                    <option value="viewer">Solo lectura</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsInviteModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Invitar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
