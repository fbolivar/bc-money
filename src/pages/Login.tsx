import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { DollarSign, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import './Auth.css';

export function Login() {
    const { signIn, user, loading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="loading-spinner"></div>
                <p>Cargando...</p>
            </div>
        );
    }
    if (user) return <Navigate to="/" replace />;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const { error } = await signIn(email, password);

        if (error) {
            setError('Credenciales incorrectas. Verifica tu email y contraseña.');
        }

        setIsLoading(false);
    };

    return (
        <div className="auth-page">
            <div className="auth-container">
                <div className="auth-header">
                    <div className="auth-logo">
                        <DollarSign size={40} />
                    </div>
                    <h1>Bienvenido a BC Money</h1>
                    <p>Inicia sesión para gestionar tus finanzas</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && <div className="auth-error">{error}</div>}

                    <div className="form-group">
                        <label className="form-label">Correo electrónico</label>
                        <div className="input-icon-wrapper">
                            <Mail size={18} className="input-icon" />
                            <input
                                type="email"
                                className="form-input with-icon"
                                placeholder="tu@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Contraseña</label>
                        <div className="input-icon-wrapper">
                            <Lock size={18} className="input-icon" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                className="form-input with-icon"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary btn-lg w-full"
                        disabled={isLoading}
                    >
                        {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                    </button>
                </form>

                <div className="auth-footer">
                    {/* Registration disabled for now */}
                </div>
            </div>

            <div className="auth-side">
                <div className="auth-side-content">
                    <h2>Toma el control de tus finanzas</h2>
                    <ul className="auth-features">
                        <li>📊 Dashboard con visión completa de tu dinero</li>
                        <li>💰 Control de gastos e ingresos</li>
                        <li>🎯 Metas financieras personalizadas</li>
                        <li>🤖 Asesor IA para tus decisiones</li>
                        <li>📈 Reportes y análisis detallados</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
