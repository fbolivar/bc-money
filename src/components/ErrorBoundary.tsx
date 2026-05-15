import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import './ErrorBoundary.css';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught:', error);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="eb-overlay">
                    <div className="eb-card">
                        <AlertTriangle size={48} color="#ef4444" className="eb-icon" />
                        <h1 className="eb-title">Algo salió mal</h1>
                        <p className="eb-desc">Ha ocurrido un error inesperado.</p>
                        {this.state.error && (
                            <code className="eb-error-msg">
                                {this.state.error.message || String(this.state.error)}
                            </code>
                        )}
                        <button
                            type="button"
                            className="eb-btn"
                            onClick={() => window.location.reload()}
                        >
                            <RefreshCw size={18} />
                            Recargar Aplicación
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
