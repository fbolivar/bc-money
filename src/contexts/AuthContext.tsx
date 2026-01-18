/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/supabase';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    profile: Profile | null;
    loading: boolean;
    isAdmin: boolean;
    signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    const isAdmin = profile?.role === 'admin';


    const fetchProfile = useCallback(async (userId: string) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (!error && data) {
            if (data.status === 'banned') {
                await supabase.auth.signOut();
                setUser(null);
                setSession(null);
                setProfile(null);
                return;
            }
            setProfile(data as Profile);
        }
    }, []);

    const refreshProfile = useCallback(async () => {
        if (user) {
            await fetchProfile(user.id);
        }
    }, [user, fetchProfile]);

    useEffect(() => {
        let mounted = true;

        // Timeout de seguridad: Si Supabase no responde en 3 segundos, forzamos la carga
        // Esto evita que la app se quede congelada en "Cargando..." por problemas de red o caché
        const safetyTimer = setTimeout(() => {
            if (mounted) {
                console.warn('Verificación de autenticación tardó demasiado - forzando finalización');
                setLoading(false);
            }
        }, 3000);

        async function getInitialSession() {
            try {
                // Usamos Promise.race para evitar bloqueos si getSession nunca resuelve
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise<{ data: { session: Session | null }, error: any }>((_, reject) =>
                    setTimeout(() => reject(new Error('Tiempo de espera agotado al obtener sesión')), 4000)
                );

                const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]);

                if (error) throw error;

                if (mounted) {
                    setSession(session);
                    setUser(session?.user ?? null);
                    if (session?.user) {
                        try {
                            await fetchProfile(session.user.id);
                        } catch (err) {
                            console.error('Error fetching profile:', err);
                        }
                    }
                }
            } catch (error) {
                console.error('Error getting session:', error);
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        }

        getInitialSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                if (!mounted) return;

                setSession(session);
                setUser(session?.user ?? null);

                if (session?.user) {
                    await fetchProfile(session.user.id).catch(err => console.error(err));
                } else {
                    setProfile(null);
                }

                if (mounted) {
                    setLoading(false);
                }
            }
        );

        return () => {
            mounted = false;
            clearTimeout(safetyTimer);
            subscription.unsubscribe();
        };
    }, [fetchProfile]);

    const signUp = useCallback(async (email: string, password: string, fullName: string) => {
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                },
            },
        });
        return { error };
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        return { error };
    }, []);

    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setProfile(null);
    }, []);

    const value = useMemo(() => ({
        user,
        session,
        profile,
        loading,
        isAdmin,
        signUp,
        signIn,
        signOut,
        refreshProfile,
    }), [user, session, profile, loading, isAdmin, signUp, signIn, signOut, refreshProfile]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
