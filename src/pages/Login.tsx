import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, DollarSign, TrendingUp, Shield, Target } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import './Auth.css';

export function Login() {
    const { signIn, user, loading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    if (loading) return <div className="loading-screen"><div className="loading-spinner"></div></div>;
    if (user) return <Navigate to="/" replace />;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        const { error } = await signIn(email, password);
        if (error) setError('Credenciales incorrectas. Verifica tu email y contraseña.');
        setIsLoading(false);
    };

    return (
        <div className="login-page">
            {/* Panel izquierdo — marca */}
            <div className="login-brand">
                <div className="login-brand-logo">
                    <div className="login-brand-logo-icon">
                        <DollarSign size={22} />
                    </div>
                    <span className="login-brand-name">BC Money</span>
                </div>

                <div className="login-brand-content">
                    <h2>Toma el control de tus finanzas personales</h2>
                    <p>Registra gastos, presupuestos, metas y patrimonio en un solo lugar. Toma decisiones con claridad.</p>
                </div>

                <div className="login-brand-stats">
                    <div className="login-brand-stat">
                        <TrendingUp size={16} color="rgba(255,255,255,0.7)" />
                        <strong>Patrimonio</strong>
                        <span>Seguimiento en tiempo real</span>
                    </div>
                    <div className="login-brand-stat">
                        <Shield size={16} color="rgba(255,255,255,0.7)" />
                        <strong>Seguro</strong>
                        <span>Datos encriptados</span>
                    </div>
                    <div className="login-brand-stat">
                        <Target size={16} color="rgba(255,255,255,0.7)" />
                        <strong>Metas</strong>
                        <span>Alcanza tus objetivos</span>
                    </div>
                </div>
            </div>

            {/* Panel derecho — formulario */}
            <div className="login-form-panel">
                <div className="login-card">
                    <div className="login-card-header">
                        <h1>Bienvenido de nuevo</h1>
                        <p>Ingresa tus credenciales para continuar</p>
                    </div>

                    {error && <div className="login-error">{error}</div>}

                    <form onSubmit={handleSubmit} className="login-form">
                        <div className="login-field">
                            <Mail size={17} className="login-field-icon" />
                            <input
                                type="email"
                                placeholder="correo@ejemplo.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>

                        <div className="login-field">
                            <Lock size={17} className="login-field-icon" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Contraseña"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                            />
                            <button type="button" className="login-eye" onClick={() => setShowPassword(!showPassword)} title="Mostrar/ocultar">
                                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                            </button>
                        </div>

                        <button type="submit" className="login-btn" disabled={isLoading}>
                            {isLoading ? 'Ingresando...' : 'Ingresar'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
