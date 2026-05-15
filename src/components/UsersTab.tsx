import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/supabase';
import { Shield, User, Ban, CheckCircle, Search, Filter, Plus, Trash2, Edit2, X, Eye, EyeOff, Receipt, Download, BarChart3 } from 'lucide-react';
import { format, formatDistanceToNow, subMonths, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import './UsersTab.css';

export function UsersTab() {
    const { isAdmin, profile: currentProfile, refreshProfile } = useAuth();
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [showChart, setShowChart] = useState(false);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
    const [editingUser, setEditingUser] = useState<Profile | null>(null);
    const [formLoading, setFormLoading] = useState(false);

    const [formData, setFormData] = useState({
        email: '',
        full_name: '',
        password: '',
        role: 'user' as 'user' | 'admin',
        currency: 'USD',
    });

    const [showPassword, setShowPassword] = useState(false);

    const fetchProfiles = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            alert('Error al cargar la lista de usuarios. Asegúrate de tener permisos de administrador.');
        } else {
            setProfiles(data as Profile[]);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (isAdmin) {
            fetchProfiles();
        }
    }, [isAdmin]);

    // ─── Métricas ────────────────────────────────────────────────────────────
    const metrics = useMemo(() => {
        const total = profiles.length;
        const active = profiles.filter(p => !p.status || p.status === 'active').length;
        const banned = profiles.filter(p => p.status === 'banned').length;
        const billingEnabled = profiles.filter(p => p.billing_enabled).length;
        return { total, active, banned, billingEnabled };
    }, [profiles]);

    // ─── Gráfica: registros por mes (últimos 6 meses) ─────────────────────
    const chartData = useMemo(() => {
        const now = new Date();
        return Array.from({ length: 6 }, (_, i) => {
            const monthStart = startOfMonth(subMonths(now, 5 - i));
            const monthEnd = startOfMonth(subMonths(now, 4 - i));
            const label = format(monthStart, 'MMM', { locale: es });
            const count = profiles.filter(p => {
                const d = new Date(p.created_at);
                return d >= monthStart && d < monthEnd;
            }).length;
            return { mes: label, registros: count };
        });
    }, [profiles]);

    // ─── Filtrado ─────────────────────────────────────────────────────────
    const filteredProfiles = profiles.filter(p => {
        const matchesSearch =
            p.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'all' || p.role === roleFilter;
        const effectiveStatus = p.status || 'active';
        const matchesStatus = statusFilter === 'all' || effectiveStatus === statusFilter;
        return matchesSearch && matchesRole && matchesStatus;
    });

    // ─── Exportar CSV ─────────────────────────────────────────────────────
    const handleExportCSV = () => {
        const rows = filteredProfiles.map(p => ({
            email: p.email,
            nombre: p.full_name || '',
            rol: p.role || 'user',
            status: p.status || 'active',
            fecha_registro: format(new Date(p.created_at), 'dd/MM/yyyy', { locale: es }),
            billing_enabled: p.billing_enabled ? 'Sí' : 'No',
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
        XLSX.writeFile(wb, `bc-money-usuarios-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };

    // ─── Handlers ────────────────────────────────────────────────────────
    const handleCreateUser = () => {
        setFormData({ email: '', full_name: '', password: '', role: 'user', currency: 'USD' });
        setModalMode('create');
        setShowModal(true);
    };

    const handleEditUser = (profile: Profile) => {
        setEditingUser(profile);
        setFormData({
            email: profile.email,
            full_name: profile.full_name || '',
            password: '',
            role: profile.role || 'user',
            currency: profile.currency || 'USD',
        });
        setModalMode('edit');
        setShowModal(true);
    };

    const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

    const confirmDeleteUser = async () => {
        const userId = deleteUserId;
        if (!userId) return;
        setDeleteUserId(null);

        try {
            const { error: fnError } = await supabase.functions.invoke('admin-users', {
                body: { action: 'delete_user', payload: { userId } }
            });

            if (fnError) throw fnError;

            setProfiles(prev => prev.filter(p => p.id !== userId));
            alert('Usuario eliminado correctamente.');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Error desconocido';
            alert('Error al eliminar usuario: ' + message);
        }
    };

    const handleBillingToggle = async (targetUserId: string, current: boolean) => {
        const { error } = await supabase
            .from('profiles')
            .update({ billing_enabled: !current })
            .eq('id', targetUserId);
        if (error) {
            alert('Error al actualizar');
        } else {
            setProfiles(prev => prev.map(p => p.id === targetUserId ? { ...p, billing_enabled: !current } : p));
            if (targetUserId === currentProfile?.id) await refreshProfile();
        }
    };

    const handleStatusChange = async (targetUserId: string, newStatus: 'active' | 'banned') => {
        if (targetUserId === currentProfile?.id) return;

        const { error } = await supabase
            .from('profiles')
            .update({ status: newStatus })
            .eq('id', targetUserId);

        if (error) {
            alert('Error al actualizar estado');
        } else {
            setProfiles(prev => prev.map(p => p.id === targetUserId ? { ...p, status: newStatus } : p));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormLoading(true);

        try {
            if (modalMode === 'create') {
                const { error: fnError } = await supabase.functions.invoke('admin-users', {
                    body: {
                        action: 'create_user',
                        payload: {
                            email: formData.email,
                            password: formData.password,
                            full_name: formData.full_name,
                            role: formData.role,
                            currency: formData.currency,
                        }
                    }
                });

                if (fnError) throw fnError;

                alert('Usuario creado exitosamente. Se ha enviado un correo de confirmación (si está configurado).');
                setShowModal(false);
                fetchProfiles();
            } else {
                if (editingUser) {
                    await supabase
                        .from('profiles')
                        .update({
                            full_name: formData.full_name,
                            role: formData.role,
                            currency: formData.currency
                        })
                        .eq('id', editingUser.id);

                    if (formData.password || formData.email !== editingUser.email) {
                        const updates: Record<string, unknown> = { userId: editingUser.id };
                        if (formData.password) updates.password = formData.password;
                        if (formData.email !== editingUser.email) updates.email = formData.email;
                        updates.currency = formData.currency;

                        const { error: fnError } = await supabase.functions.invoke('admin-users', {
                            body: { action: 'update_user_auth', payload: updates }
                        });
                        if (fnError) throw fnError;
                    }

                    setShowModal(false);
                    fetchProfiles();
                    alert('Usuario actualizado correctamente.');
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Intente nuevamente.';
            alert('Error al guardar usuario: ' + message);
        } finally {
            setFormLoading(false);
        }
    };

    if (!isAdmin) return null;

    if (loading && profiles.length === 0) {
        return <div className="loading-container"><div className="loading-spinner"></div></div>;
    }

    return (
        <div className="users-tab animate-fadeIn">

            {/* ── Tarjetas de métricas ── */}
            <div className="metrics-grid">
                <div className="metric-card">
                    <div className="metric-icon metric-icon--total">👥</div>
                    <div className="metric-body">
                        <span className="metric-value">{metrics.total}</span>
                        <span className="metric-label">Total usuarios</span>
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-icon metric-icon--active">✅</div>
                    <div className="metric-body">
                        <span className="metric-value">{metrics.active}</span>
                        <span className="metric-label">Activos</span>
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-icon metric-icon--banned">🚫</div>
                    <div className="metric-body">
                        <span className="metric-value">{metrics.banned}</span>
                        <span className="metric-label">Suspendidos</span>
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-icon metric-icon--billing">💳</div>
                    <div className="metric-body">
                        <span className="metric-value">{metrics.billingEnabled}</span>
                        <span className="metric-label">Billing activo</span>
                    </div>
                </div>
            </div>

            {/* ── Gráfica de registros ── */}
            <div className="chart-section">
                <button
                    className="chart-toggle-btn"
                    onClick={() => setShowChart(v => !v)}
                >
                    <BarChart3 size={16} />
                    {showChart ? 'Ocultar gráfica' : 'Ver registros por mes'}
                </button>

                {showChart && (
                    <div className="chart-container">
                        <h4 className="chart-title">Registros de usuarios — últimos 6 meses</h4>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={chartData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                <XAxis
                                    dataKey="mes"
                                    tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--color-surface)',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: '8px',
                                        fontSize: '0.85rem',
                                    }}
                                    cursor={{ fill: 'var(--color-bg-secondary)' }}
                                    formatter={(value: number) => [value, 'Registros']}
                                />
                                <Bar
                                    dataKey="registros"
                                    fill="var(--color-primary)"
                                    radius={[4, 4, 0, 0]}
                                    maxBarSize={48}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* ── Barra de filtros + acciones ── */}
            <div className="flex justify-between items-center mb-md">
                <div className="filters-bar flex-1">
                    <div className="search-wrapper">
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre o email..."
                            className="search-input"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="filter-wrapper">
                        <Filter size={18} className="filter-icon" />
                        <select
                            className="form-select filter-select"
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                        >
                            <option value="all">Todos los roles</option>
                            <option value="admin">Administradores</option>
                            <option value="user">Usuarios</option>
                        </select>
                    </div>
                    <div className="filter-wrapper">
                        <Filter size={18} className="filter-icon" />
                        <select
                            className="form-select filter-select"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="all">Todos los estados</option>
                            <option value="active">Activo</option>
                            <option value="banned">Suspendido</option>
                        </select>
                    </div>
                </div>
                <div className="table-actions">
                    <button type="button" className="btn btn-secondary" onClick={handleExportCSV} title="Exportar a Excel">
                        <Download size={16} /> Exportar
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleCreateUser}>
                        <Plus size={18} /> Nuevo Usuario
                    </button>
                </div>
            </div>

            {/* ── Tabla de usuarios ── */}
            <div className="users-table-container">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Usuario</th>
                            <th>Estado</th>
                            <th>Rol</th>
                            <th>Facturación</th>
                            <th>Registro</th>
                            <th>Último acceso</th>
                            <th className="text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredProfiles.map((p) => (
                            <tr key={p.id} className={p.status === 'banned' ? 'row-banned' : ''}>
                                <td>
                                    <div className="user-cell">
                                        <div className="user-avatar-small">
                                            {p.full_name?.[0]?.toUpperCase() || '?'}
                                        </div>
                                        <div>
                                            <div className="font-medium">{p.full_name || 'Sin nombre'}</div>
                                            <div className="text-sm text-secondary">{p.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span className={`status-badge ${p.status || 'active'}`}>
                                        {p.status === 'banned' ? 'Suspendido' : 'Activo'}
                                    </span>
                                </td>
                                <td>
                                    <div className="role-selector">
                                        {p.role === 'admin' ? <Shield size={16} className="text-primary" /> : <User size={16} />}
                                        <span className="capitalize">{p.role || 'user'}</span>
                                    </div>
                                </td>
                                <td>
                                    <button
                                        type="button"
                                        className={`billing-toggle-btn ${p.billing_enabled ? 'enabled' : ''}`}
                                        onClick={() => handleBillingToggle(p.id, !!p.billing_enabled)}
                                        title={p.billing_enabled ? 'Desactivar facturación' : 'Activar facturación'}
                                    >
                                        <Receipt size={14} />
                                        {p.billing_enabled ? 'Activo' : 'Inactivo'}
                                    </button>
                                </td>
                                <td className="text-nowrap">
                                    {format(new Date(p.created_at), 'd MMM yyyy', { locale: es })}
                                </td>
                                <td className="text-nowrap last-access-cell">
                                    {p.updated_at
                                        ? formatDistanceToNow(new Date(p.updated_at), { addSuffix: true, locale: es })
                                        : '—'}
                                </td>
                                <td className="text-right">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            className="action-btn"
                                            onClick={() => handleEditUser(p)}
                                            title="Editar Usuario"
                                            disabled={p.id === currentProfile?.id}
                                        >
                                            <Edit2 size={16} />
                                        </button>

                                        {p.id !== currentProfile?.id && (
                                            <>
                                                <button
                                                    className={`action-btn ${p.status === 'banned' ? 'text-success' : 'text-warning'}`}
                                                    onClick={() => handleStatusChange(p.id, p.status === 'banned' ? 'active' : 'banned')}
                                                    title={p.status === 'banned' ? 'Activar cuenta' : 'Suspender cuenta'}
                                                >
                                                    {p.status === 'banned' ? <CheckCircle size={16} /> : <Ban size={16} />}
                                                </button>

                                                <button
                                                    className="action-btn text-danger"
                                                    onClick={() => { if (p.id !== currentProfile?.id) setDeleteUserId(p.id); }}
                                                    title="Eliminar permanentemente"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}

                        {filteredProfiles.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: '2rem' }}>
                                    No se encontraron usuarios con los filtros actuales.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* ── Modal crear / editar ── */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h3>{modalMode === 'create' ? 'Nuevo Usuario' : 'Editar Usuario'}</h3>
                            <button onClick={() => setShowModal(false)} className="close-btn">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-content">
                            <div className="form-group">
                                <label>Nombre Completo</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.full_name}
                                    onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Email</label>
                                <input
                                    type="email"
                                    className="form-input"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>
                                    {modalMode === 'create' ? 'Contraseña' : 'Nueva Contraseña (opcional)'}
                                </label>
                                <div className="password-input-wrapper relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className="form-input"
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        required={modalMode === 'create'}
                                        minLength={6}
                                        placeholder={modalMode === 'edit' ? 'Dejar en blanco para mantener actual' : ''}
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowPassword(!showPassword)}
                                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Rol</label>
                                <select
                                    className="form-select"
                                    value={formData.role}
                                    onChange={e => setFormData({ ...formData, role: e.target.value as 'user' | 'admin' })}
                                >
                                    <option value="user">Usuario</option>
                                    <option value="admin">Administrador</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Moneda</label>
                                <select
                                    className="form-select"
                                    value={formData.currency}
                                    onChange={e => setFormData({ ...formData, currency: e.target.value })}
                                >
                                    <option value="USD">USD - Dólar Estadounidense</option>
                                    <option value="EUR">EUR - Euro</option>
                                    <option value="COP">COP - Peso Colombiano</option>
                                    <option value="MXN">MXN - Peso Mexicano</option>
                                    <option value="ARS">ARS - Peso Argentino</option>
                                    <option value="CLP">CLP - Peso Chileno</option>
                                    <option value="PEN">PEN - Sol Peruano</option>
                                </select>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={formLoading}>
                                    {formLoading ? 'Guardando...' : (modalMode === 'create' ? 'Crear Usuario' : 'Guardar Cambios')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal confirmar eliminación ── */}
            {deleteUserId && (
                <div className="modal-overlay" onClick={() => setDeleteUserId(null)}>
                    <div className="modal modal--confirm" onClick={e => e.stopPropagation()}>
                        <h2 className="confirm-title">¿Eliminar este usuario?</h2>
                        <p className="confirm-body">Esta acción es permanente y no se puede deshacer.</p>
                        <div className="confirm-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setDeleteUserId(null)}>Cancelar</button>
                            <button type="button" className="btn btn-danger" onClick={confirmDeleteUser}>Eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
