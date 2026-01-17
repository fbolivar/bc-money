import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppLayout() {
    const { user, loading, profile } = useAuth();

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="loading-spinner"></div>
                <p>Cargando...</p>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Redirect to onboarding if not completed
    if (profile && !profile.onboarding_completed) {
        return <Navigate to="/onboarding" replace />;
    }

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <TopBar />
                <div className="page-content">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
