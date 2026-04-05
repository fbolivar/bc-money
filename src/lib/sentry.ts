import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

export function initSentry() {
    if (!SENTRY_DSN || import.meta.env.DEV) return;

    Sentry.init({
        dsn: SENTRY_DSN,
        integrations: [
            Sentry.browserTracingIntegration(),
        ],
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0.5,
        environment: import.meta.env.MODE,
    });
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
    if (import.meta.env.DEV) {
        console.error(error);
        return;
    }
    Sentry.captureException(error, { extra: context });
}

export { Sentry };
