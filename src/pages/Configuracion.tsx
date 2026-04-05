import { useState, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase, createTemporaryClient } from '../lib/supabase';
import { UsersTab } from '../components/UsersTab';
import { createBackup, restoreBackup } from '../lib/backup';
import { User, Shield, Lock, Save, DollarSign, Bell, HardDrive, Download, Upload, AlertTriangle, CheckCircle } from 'lucide-react';
import './Configuracion.css';

const CURRENCIES = [
    { value: 'USD', label: 'USD - Dólar estadounidense' },
    { value: 'COP', label: 'COP - Peso colombiano' },
    { value: 'EUR', label: 'EUR - Euro' },
    { value: 'MXN', label: 'MXN - Peso mexicano' },
];

type Tab = 'profile' | 'alerts' | 'backup' | 'users';

export function Configuracion() {
    const { user, profile, isAdmin, refreshProfile } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('profile');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [updatingPassword, setUpdatingPassword] = useState(false);
    const [savingCurrency, setSavingCurrency] = useState(false);
    const [savingAlerts, setSavingAlerts] = useState(false);
    const [alertSettings, setAlertSettings] = useState({
        alerts_enabled: profile?.alerts_enabled ?? true,
        alert_warranty_days: profile?.alert_warranty_days ?? 30,
        alert_debt_days: profile?.alert_debt_days ?? 7,
        alert_budget_pct: profile?.alert_budget_pct ?? 80,
    });
    const [backupPassword, setBackupPassword] = useState('');
    const [backupConfirmPassword, setBackupConfirmPassword] = useState('');
    const [restorePassword, setRestorePassword] = useState('');
    const [backupLoading, setBackupLoading] = useState(false);
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [backupResult, setBackupResult] = useState<Record<string, number> | null>(null);
    const [restoreResult, setRestoreResult] = useState<Record<string, number> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleCurrencyChange = async (newCurrency: string) => {
        if (!user || newCurrency === profile?.currency) return;
        setSavingCurrency(true);
        setMessage(null);
        const { error } = await supabase
            .from('profiles')
            .update({ currency: newCurrency })
            .eq('id', user.id);
        if (error) {
            setMessage({ type: 'error', text: 'Error al actualizar la moneda: ' + error.message });
        } else {
            setMessage({ type: 'success', text: 'Moneda actualizada correctamente' });
            await refreshProfile();
        }
        setSavingCurrency(false);
    };

    const handleSaveAlerts = async () => {
        if (!user) return;
        setSavingAlerts(true);
        setMessage(null);
        const { error } = await supabase.from('profiles').update({
            alerts_enabled: alertSettings.alerts_enabled,
            alert_warranty_days: alertSettings.alert_warranty_days,
            alert_debt_days: alertSettings.alert_debt_days,
            alert_budget_pct: alertSettings.alert_budget_pct,
        }).eq('id', user.id);
        if (error) setMessage({ type: 'error', text: 'Error al guardar: ' + error.message });
        else { setMessage({ type: 'success', text: 'Configuración de alertas guardada' }); await refreshProfile(); }
        setSavingAlerts(false);
    };

    const handleBackup = async () => {
        if (!user) return;
        if (!backupPassword || backupPassword.length < 6) {
            setMessage({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres' });
            return;
        }
        if (backupPassword !== backupConfirmPassword) {
            setMessage({ type: 'error', text: 'Las contraseñas no coinciden' });
            return;
        }
        setBackupLoading(true);
        setMessage(null);
        setBackupResult(null);
        try {
            const { blob, filename, tables } = await createBackup(user.id, backupPassword);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename; a.click();
            URL.revokeObjectURL(url);
            setBackupResult(tables);
            setMessage({ type: 'success', text: `Backup creado: ${filename}` });
            setBackupPassword('');
            setBackupConfirmPassword('');
        } catch (err) {
            setMessage({ type: 'error', text: `Error: ${err instanceof Error ? err.message : 'Error desconocido'}` });
        } finally {
            setBackupLoading(false);
        }
    };

    const handleRestore = async (file: File) => {
        if (!user) return;
        if (!restorePassword) {
            setMessage({ type: 'error', text: 'Ingresa la contraseña del backup' });
            return;
        }
        if (!file.name.endsWith('.mafe')) {
            setMessage({ type: 'error', text: 'Solo se aceptan archivos .mafe' });
            return;
        }
        setRestoreLoading(true);
        setMessage(null);
        setRestoreResult(null);
        try {
            const { tables } = await restoreBackup(file, restorePassword, user.id);
            setRestoreResult(tables);
            setMessage({ type: 'success', text: 'Restauración completada exitosamente' });
            setRestorePassword('');
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error al restaurar' });
        } finally {
            setRestoreLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

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
        if (newPassword.length < 8) {
            setMessage({ type: 'error', text: 'La contraseña debe tener al menos 8 caracteres' });
            return;
        }
        if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
            setMessage({ type: 'error', text: 'Debe incluir mayúsculas, minúsculas y números' });
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
                    <button
                        className={`config-nav-item ${activeTab === 'alerts' ? 'active' : ''}`}
                        onClick={() => setActiveTab('alerts')}
                    >
                        <Bell size={20} />
                        <span>Alertas</span>
                    </button>
                    <button
                        className={`config-nav-item ${activeTab === 'backup' ? 'active' : ''}`}
                        onClick={() => setActiveTab('backup')}
                    >
                        <HardDrive size={20} />
                        <span>Backup</span>
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
                    {activeTab === 'profile' && (
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
                                        <div className="input-group" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <DollarSign size={18} style={{ position: 'absolute', left: '10px', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
                                            <select
                                                className="form-input"
                                                style={{ paddingLeft: '35px', cursor: 'pointer' }}
                                                value={profile?.currency || 'USD'}
                                                onChange={(e) => handleCurrencyChange(e.target.value)}
                                                disabled={savingCurrency}
                                            >
                                                {CURRENCIES.map(c => (
                                                    <option key={c.value} value={c.value}>{c.label}</option>
                                                ))}
                                            </select>
                                        </div>
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
                    )}

                    {activeTab === 'alerts' && (
                        <div className="profile-section">
                            <h3>Configuración de Alertas</h3>
                            <div className="profile-card" style={{ flexDirection: 'column', gap: '1.5rem' }}>
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={alertSettings.alerts_enabled}
                                            onChange={e => setAlertSettings({ ...alertSettings, alerts_enabled: e.target.checked })}
                                            style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                                        />
                                        <span style={{ fontWeight: 600, fontSize: '1rem' }}>Activar sistema de alertas</span>
                                    </label>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                                        Recibe notificaciones de garantías, deudas y presupuestos en la campana
                                    </p>
                                </div>

                                <div className="alerts-grid">
                                    <div className="form-group">
                                        <label>Días aviso garantías</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={alertSettings.alert_warranty_days}
                                            onChange={e => setAlertSettings({ ...alertSettings, alert_warranty_days: parseInt(e.target.value) || 0 })}
                                            min="1" max="365"
                                        />
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                            Avisar {alertSettings.alert_warranty_days} días antes del vencimiento
                                        </span>
                                    </div>

                                    <div className="form-group">
                                        <label>Días aviso deudas</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={alertSettings.alert_debt_days}
                                            onChange={e => setAlertSettings({ ...alertSettings, alert_debt_days: parseInt(e.target.value) || 0 })}
                                            min="1" max="30"
                                        />
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                            Avisar {alertSettings.alert_debt_days} días antes de la cuota
                                        </span>
                                    </div>

                                    <div className="form-group">
                                        <label>% presupuesto para aviso</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={alertSettings.alert_budget_pct}
                                            onChange={e => setAlertSettings({ ...alertSettings, alert_budget_pct: parseInt(e.target.value) || 0 })}
                                            min="1" max="100"
                                        />
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                            Avisar al superar el {alertSettings.alert_budget_pct}% del presupuesto
                                        </span>
                                    </div>
                                </div>

                                {message && (
                                    <div className={`message ${message.type}`} style={{
                                        padding: '0.75rem', borderRadius: 'var(--radius)',
                                        backgroundColor: message.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                                        color: message.type === 'error' ? 'var(--expense)' : 'var(--income)', fontSize: '0.9rem'
                                    }}>
                                        {message.text}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleSaveAlerts}
                                    disabled={savingAlerts}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', alignSelf: 'flex-start' }}
                                >
                                    {savingAlerts ? 'Guardando...' : <><Save size={18} /> Guardar Alertas</>}
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'backup' && (
                        <div className="profile-section">
                            <h3>Backup y Restauración</h3>

                            {/* Backup */}
                            <div className="profile-card" style={{ flexDirection: 'column', gap: '1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <Download size={22} color="#10B981" />
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: '1rem' }}>Crear Backup</h4>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            Exporta toda tu información en formato .mafe encriptado
                                        </p>
                                    </div>
                                </div>

                                <div className="alerts-grid">
                                    <div className="form-group">
                                        <label>Contraseña de cifrado</label>
                                        <input type="password" className="form-input" value={backupPassword}
                                            onChange={e => setBackupPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                                    </div>
                                    <div className="form-group">
                                        <label>Confirmar contraseña</label>
                                        <input type="password" className="form-input" value={backupConfirmPassword}
                                            onChange={e => setBackupConfirmPassword(e.target.value)} placeholder="Repetir contraseña" />
                                    </div>
                                </div>

                                <button type="button" className="btn btn-primary" onClick={handleBackup}
                                    disabled={backupLoading || !backupPassword}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', alignSelf: 'flex-start' }}>
                                    {backupLoading ? 'Generando backup...' : <><Download size={18} /> Descargar Backup .mafe</>}
                                </button>

                                {backupResult && (
                                    <div style={{ background: '#ECFDF5', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.8rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', color: '#059669', fontWeight: 600 }}>
                                            <CheckCircle size={16} /> Backup exitoso
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {Object.entries(backupResult).filter(([, v]) => v > 0).map(([k, v]) => (
                                                <span key={k} style={{ background: '#D1FAE5', padding: '0.2rem 0.5rem', borderRadius: '0.25rem' }}>
                                                    {k}: {v}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Restore */}
                            <div className="profile-card" style={{ flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <Upload size={22} color="#3B82F6" />
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: '1rem' }}>Restaurar Backup</h4>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            Importa un archivo .mafe para restaurar tu información
                                        </p>
                                    </div>
                                </div>

                                <div style={{ background: '#FEF3C7', padding: '0.75rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8rem', color: '#92400E' }}>
                                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <span>La restauración reemplazará todos los datos actuales. Esta acción no se puede deshacer.</span>
                                </div>

                                <div className="form-group">
                                    <label>Contraseña del backup</label>
                                    <input type="password" className="form-input" value={restorePassword}
                                        onChange={e => setRestorePassword(e.target.value)} placeholder="Contraseña usada al crear el backup" />
                                </div>

                                <div className="form-group">
                                    <label>Archivo .mafe</label>
                                    <input type="file" ref={fileInputRef} accept=".mafe"
                                        className="form-input" style={{ padding: '0.5rem' }}
                                        onChange={e => { if (e.target.files?.[0]) handleRestore(e.target.files[0]); }} disabled={restoreLoading || !restorePassword} />
                                </div>

                                {restoreLoading && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#3B82F6', fontSize: '0.9rem' }}>
                                        <div className="loading-spinner" style={{ width: 20, height: 20 }}></div> Restaurando datos...
                                    </div>
                                )}

                                {restoreResult && (
                                    <div style={{ background: '#EFF6FF', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.8rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', color: '#2563EB', fontWeight: 600 }}>
                                            <CheckCircle size={16} /> Restauración exitosa
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {Object.entries(restoreResult).filter(([, v]) => v > 0).map(([k, v]) => (
                                                <span key={k} style={{ background: '#DBEAFE', padding: '0.2rem 0.5rem', borderRadius: '0.25rem' }}>
                                                    {k}: {v}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {message && activeTab === 'backup' && (
                                <div className={`message ${message.type}`} style={{
                                    padding: '0.75rem', borderRadius: 'var(--radius)', marginTop: '1rem',
                                    backgroundColor: message.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                                    color: message.type === 'error' ? 'var(--expense)' : 'var(--income)', fontSize: '0.9rem'
                                }}>
                                    {message.text}
                                </div>
                            )}
                        </div>
                    )}

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
