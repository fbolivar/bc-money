import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
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
        if (error) setError('Credenciales incorrectas');
        setIsLoading(false);
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <img src="/icon.svg" alt="BC Money" className="login-logo" />
                <h1>BC Money</h1>

                {error && <div className="login-error">{error}</div>}

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="login-field">
                        <Mail size={18} className="login-field-icon" />
                        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>

                    <div className="login-field">
                        <Lock size={18} className="login-field-icon" />
                        <input type={showPassword ? 'text' : 'password'} placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} required />
                        <button type="button" className="login-eye" onClick={() => setShowPassword(!showPassword)} title="Mostrar contraseña">
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>

                    <button type="submit" className="login-btn" disabled={isLoading}>
                        {isLoading ? 'Ingresando...' : 'Ingresar'}
                    </button>
                </form>
            </div>
        </div>
    );
}
