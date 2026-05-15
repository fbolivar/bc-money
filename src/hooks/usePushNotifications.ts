import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY = 'BI-Uedeg0CFkre61mcz7iwaVi3hQG010MBG8NhaD_Tye-czNUWbqFE52x2M-SyJbEFCD-YeD1PYhhYUMKea-wYw';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export type PushStatus = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed' | 'loading';

export function usePushNotifications() {
    const [status, setStatus] = useState<PushStatus>('loading');

    const checkStatus = useCallback(async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            setStatus('unsupported'); return;
        }
        const perm = Notification.permission;
        if (perm === 'denied') { setStatus('denied'); return; }

        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        setStatus(existing ? 'subscribed' : 'unsubscribed');
    }, []);

    useEffect(() => { checkStatus(); }, [checkStatus]);

    const subscribe = useCallback(async () => {
        if (!('serviceWorker' in navigator)) return;
        setStatus('loading');

        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { setStatus('denied'); return; }

        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });

            const { data: session } = await supabase.auth.getSession();
            const token = session?.session?.access_token ?? '';

            await fetch('/api/push-subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ subscription: sub.toJSON(), action: 'subscribe' }),
            });

            setStatus('subscribed');
        } catch {
            setStatus('unsubscribed');
        }
    }, []);

    const unsubscribe = useCallback(async () => {
        setStatus('loading');
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) await sub.unsubscribe();

            const { data: session } = await supabase.auth.getSession();
            const token = session?.session?.access_token ?? '';

            await fetch('/api/push-subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ action: 'unsubscribe' }),
            });

            setStatus('unsubscribed');
        } catch {
            await checkStatus();
        }
    }, [checkStatus]);

    return { status, subscribe, unsubscribe };
}
