import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { DollarSign, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import './Auth.css';

export function Signup() {
    const { signUp, user, loading } = useAuth();
    const navigate = useNavigate();
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
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

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        if (password.length < 8) {
            setError('La contraseña debe tener al menos 8 caracteres');
            return;
        }
        if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
            setError('La contraseña debe incluir mayúsculas, minúsculas y números');
            return;
        }

        setIsLoading(true);

        const { error } = await signUp(email, password, fullName);

        if (error) {
            setError('No se pudo crear la cuenta. Verifica los datos e intenta de nuevo.');
        } else {
            navigate('/onboarding');
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
                    <h1>Crea tu cuenta</h1>
                    <p>Empieza a gestionar tus finanzas hoy</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && <div className="auth-error">{error}</div>}

                    <div className="form-group">
                        <label className="form-label">Nombre completo</label>
                        <div className="input-icon-wrapper">
                            <User size={18} className="input-icon" />
                            <input
                                type="text"
                                className="form-input with-icon"
                                placeholder="Tu nombre"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                required
                            />
                        </div>
                    </div>

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
                                placeholder="Mínimo 6 caracteres"
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

                    <div className="form-group">
                        <label className="form-label">Confirmar contraseña</label>
                        <div className="input-icon-wrapper">
                            <Lock size={18} className="input-icon" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                className="form-input with-icon"
                                placeholder="Repite tu contraseña"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary btn-lg w-full"
                        disabled={isLoading}
                    >
                        {isLoading ? 'Creando cuenta...' : 'Crear Cuenta'}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>
                        ¿Ya tienes una cuenta?{' '}
                        <Link to="/login">Inicia sesión</Link>
                    </p>
                </div>
            </div>

            <div className="auth-side">
                <div className="auth-side-content">
                    <h2>Tu camino hacia la libertad financiera</h2>
                    <ul className="auth-features">
                        <li>✅ Registro gratuito</li>
                        <li>🔒 Tus datos 100% seguros</li>
                        <li>📱 Accede desde cualquier dispositivo</li>
                        <li>🚀 Comienza en minutos</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
