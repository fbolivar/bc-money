/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkOnly, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;

// Workbox precaching (manifest injected by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Runtime caching
registerRoute(
    ({ url }) => url.origin === 'https://fonts.googleapis.com',
    new CacheFirst({ cacheName: 'google-fonts-stylesheets', plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 31536000 })] })
);
registerRoute(
    ({ url }) => url.origin === 'https://fonts.gstatic.com',
    new CacheFirst({ cacheName: 'google-fonts-webfonts', plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 31536000 })] })
);
registerRoute(
    ({ url }) => url.hostname.endsWith('.supabase.co'),
    new NetworkOnly()
);

// Push notification handler
self.addEventListener('push', (event: PushEvent) => {
    let data: { title?: string; body?: string; icon?: string; url?: string } = {};
    try { data = event.data?.json() ?? {}; } catch { data = { body: event.data?.text() ?? '' }; }

    const title = data.title ?? 'BC Money';
    const options: NotificationOptions = {
        body: data.body ?? 'Tienes una notificación',
        icon: data.icon ?? '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        data: { url: data.url ?? '/' },
        tag: 'bc-money-notification',
        renotify: true,
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
    event.notification.close();
    const url: string = event.notification.data?.url ?? '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            const existing = clients.find(c => c.url.includes(self.location.origin));
            if (existing) { existing.focus(); existing.navigate(url); }
            else self.clients.openWindow(url);
        })
    );
});
