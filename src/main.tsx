import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { initSentry } from './lib/sentry.ts'
import './styles/index.css'
import App from './App.tsx'

initSentry();

// ── PWA auto-update ─────────────────────────────────────────────────────
// When a new SW activates and claims control, reload the page so the user
// always gets the latest assets without having to close/reopen the app.
if ('serviceWorker' in navigator) {
  // Guard against double-reload loops
  let reloading = false;

  // Step 1: when the SW controller changes (new SW took over), reload.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) {
      reloading = true;
      window.location.reload();
    }
  });

  // Step 2: when the app becomes visible again (user returns from background
  // on Android/iOS), ask the browser to check for a new SW version.
  // Without this, an installed PWA can go days without checking for updates.
  navigator.serviceWorker.ready
    .then(registration => {
      const checkUpdate = () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      };
      document.addEventListener('visibilitychange', checkUpdate);
      // Also check immediately on load in case a new SW is already waiting
      registration.update().catch(() => {});
    })
    .catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
