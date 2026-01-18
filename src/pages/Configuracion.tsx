import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, createTemporaryClient } from '../lib/supabase';
import { UsersTab } from '../components/UsersTab';
import { User, Shield, Lock, Save } from 'lucide-react';
import './Configuracion.css';

type Tab = 'profile' | 'users';

export function Configuracion() {
    const { user, profile, isAdmin } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('profile');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [updatingPassword, setUpdatingPassword] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (!currentPassword) {
            setMessage({ type: 'error', text: 'Debes ingresar tu contraseña actual' });
            return;
        }

        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'Las contraseñas no coinciden' });
            return;
        }
        if (newPassword.length < 6) {
            setMessage({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres' });
            return;
        }

        setUpdatingPassword(true);

        try {
            // 1. Verify current password using a temporary client to avoid affecting global session
            const tempClient = createTemporaryClient();

            const { error: signInError } = await tempClient.auth.signInWithPassword({
                email: user?.email || '',
                password: currentPassword
            });

            if (signInError) {
                setMessage({ type: 'error', text: 'La contraseña actual es incorrecta' });
                setUpdatingPassword(false);
                return;
            }

            // 2. Update password using main client (authenticated user)
            const { error } = await supabase.auth.updateUser({ password: newPassword });

            if (error) {
                setMessage({ type: 'error', text: 'Error: ' + error.message });
            } else {
                setMessage({ type: 'success', text: 'Contraseña actualizada correctamente' });
                setNewPassword('');
                setConfirmPassword('');
                setCurrentPassword('');
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
            setMessage({ type: 'error', text: 'Ocurrió un error inesperado: ' + errorMessage });
            console.error(error);
        } finally {
            setUpdatingPassword(false);
        }
    };

    return (
        <div className="configuracion-page animate-fadeIn">
            <div className="toolbar">
                <div>
                    <h2>Configuración</h2>
                    <p className="text-secondary">Administra tu cuenta y preferencias</p>
                </div>
            </div>

            <div className="config-container">
                <div className="config-sidebar">
                    <button
                        className={`config-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
                        onClick={() => setActiveTab('profile')}
                    >
                        <User size={20} />
                        <span>Mi Perfil</span>
                    </button>
                    {isAdmin && (
                        <button
                            className={`config-nav-item ${activeTab === 'users' ? 'active' : ''}`}
                            onClick={() => setActiveTab('users')}
                        >
                            <UsersIcon />
                            <span>Gestión de Usuarios</span>
                        </button>
                    )}
                </div>

                <div className="config-content">
                    <div className="profile-section">
                        <h3>Información del Usuario</h3>
                        <div className="profile-card">
                            <div className="profile-avatar-large">
                                {profile?.full_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="profile-details">
                                <div className="form-group">
                                    <label>Nombre Completo</label>
                                    <div className="value-display">{profile?.full_name}</div>
                                </div>
                                <div className="form-group">
                                    <label>Correo Electrónico</label>
                                    <div className="value-display">{user?.email}</div>
                                </div>
                                <div className="form-group">
                                    <label>Moneda</label>
                                    <div className="value-display">{profile?.currency}</div>
                                </div>
                                <div className="form-group">
                                    <label>Rol</label>
                                    <div className="value-display cap">
                                        {profile?.role === 'admin' ? (
                                            <span className="flex items-center gap-1 text-primary">
                                                <Shield size={16} /> Administrador
                                            </span>
                                        ) : 'Usuario'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="profile-section" style={{ marginTop: '2rem' }}>
                            <h3>Seguridad</h3>
                            <div className="profile-card">
                                <form onSubmit={handlePasswordChange} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div className="form-group">
                                        <label>Contraseña Actual</label>
                                        <div className="input-group" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <Lock size={18} style={{ position: 'absolute', left: '10px', color: 'var(--text-secondary)' }} />
                                            <input
                                                type="password"
                                                value={currentPassword}
                                                onChange={e => setCurrentPassword(e.target.value)}
                                                placeholder="Ingresa tu contraseña actual"
                                                className="form-input"
                                                style={{ paddingLeft: '35px' }}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div className="form-group">
                                            <label>Nueva Contraseña</label>
                                            <div className="input-group" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                <Lock size={18} style={{ position: 'absolute', left: '10px', color: 'var(--text-secondary)' }} />
                                                <input
                                                    type="password"
                                                    value={newPassword}
                                                    onChange={e => setNewPassword(e.target.value)}
                                                    placeholder="Mínimo 6 caracteres"
                                                    className="form-input"
                                                    style={{ paddingLeft: '35px' }}
                                                />
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label>Confirmar Contraseña</label>
                                            <div className="input-group" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                <Lock size={18} style={{ position: 'absolute', left: '10px', color: 'var(--text-secondary)' }} />
                                                <input
                                                    type="password"
                                                    value={confirmPassword}
                                                    onChange={e => setConfirmPassword(e.target.value)}
                                                    placeholder="Repetir contraseña"
                                                    className="form-input"
                                                    style={{ paddingLeft: '35px' }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {message && (
                                        <div className={`message ${message.type}`} style={{
                                            padding: '0.75rem',
                                            borderRadius: 'var(--radius)',
                                            backgroundColor: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                                            color: message.type === 'error' ? 'var(--expense)' : 'var(--income)',
                                            fontSize: '0.9rem'
                                        }}>
                                            {message.text}
                                        </div>
                                    )}

                                    <div style={{ alignSelf: 'flex-start' }}>
                                        <button
                                            type="submit"
                                            className="btn btn-primary"
                                            disabled={updatingPassword || !newPassword || !currentPassword}
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                        >
                                            {updatingPassword ? 'Actualizando...' : <><Save size={18} /> Actualizar Contraseña</>}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>

                    {activeTab === 'users' && isAdmin && (
                        <UsersTab />
                    )}
                </div>
            </div>
        </div>
    );
}

function UsersIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
    );
}
