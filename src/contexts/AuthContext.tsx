/* eslint-disable react-refresh/only-export-components */
import { createContext, useEffect, useState, useMemo, useCallback } from 'react';
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
    authError: string | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    const isAdmin = profile?.role === 'admin';

    const fetchProfile = useCallback(async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                console.error('Error fetching profile:', error.message);
                setAuthError('Error al cargar el perfil');
                return;
            }

            if (data?.status === 'banned') {
                await supabase.auth.signOut().catch(() => null);
                setUser(null);
                setSession(null);
                setProfile(null);
                setAuthError('Tu cuenta ha sido suspendida');
                return;
            }

            if (data) {
                setProfile(data as Profile);
                setAuthError(null);
            }
        } catch (err: unknown) {
            console.error('Exception fetching profile:', err);
            setAuthError('Error inesperado al cargar el perfil');
        }
    }, []);

    // Inicializacion unica con getSession (refresca tokens expirados)
    useEffect(() => {
        const fallbackTimer = setTimeout(() => setLoading(false), 5000);

        // getSession() refresca el JWT si esta expirado, LUEGO cargamos perfil
        supabase.auth.getSession().then(async ({ data: { session: s } }) => {
            if (s?.user) {
                setSession(s);
                setUser(s.user);
                await fetchProfile(s.user.id);
            }
            clearTimeout(fallbackTimer);
            setLoading(false);
        }).catch(() => {
            clearTimeout(fallbackTimer);
            setLoading(false);
        });

        // Solo escuchar cambios POSTERIORES al inicial
        // INITIAL_SESSION se ignora porque getSession() ya lo maneja arriba
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, newSession) => {
                if (event === 'INITIAL_SESSION') return;

                setSession(newSession);

                // Estabilizar referencia: solo actualizar user si cambio el ID
                // Esto evita que TOKEN_REFRESHED reinicie los effects del Dashboard
                setUser(prev => {
                    const newUser = newSession?.user ?? null;
                    if (prev?.id === newUser?.id) return prev;
                    return newUser;
                });

                if (!newSession?.user) {
                    setProfile(null);
                }
            }
        );

        return () => {
            clearTimeout(fallbackTimer);
            subscription.unsubscribe();
        };
    }, [fetchProfile]);

    // Cargar perfil despues de login (cuando user cambia y no hay profile)
    useEffect(() => {
        if (!user || profile) return;
        fetchProfile(user.id);
    }, [user, profile, fetchProfile]);

    const refreshProfile = useCallback(async () => {
        if (user) await fetchProfile(user.id);
    }, [user, fetchProfile]);

    const signUp = useCallback(async (email: string, password: string, fullName: string) => {
        setAuthError(null);
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } },
        });
        if (error) setAuthError(error.message);
        return { error };
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        setAuthError(null);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setAuthError(error.message);
        return { error };
    }, []);

    const signOut = useCallback(async () => {
        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.error('Error during signOut:', err);
        } finally {
            setUser(null);
            setSession(null);
            setProfile(null);
            setAuthError(null);
        }
    }, []);

    const value = useMemo(() => ({
        user, session, profile, loading, isAdmin,
        signUp, signIn, signOut, refreshProfile, authError,
    }), [user, session, profile, loading, isAdmin, signUp, signIn, signOut, refreshProfile, authError]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
