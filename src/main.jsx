import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { assertClientEnvironmentSafe, isDemoApp } from './config/appEnvironment.js';
import { getSupabasePublicHost } from './data/supabaseClient.js';
import { demoDevLog, isDemoDevUnlocked } from './lib/demoDevUnlock.js';

assertClientEnvironmentSafe();

if (isDemoDevUnlocked()) {
  demoDevLog('SB_URL runtime → ver supabaseClient / signup logs');
  demoDevLog('VITE_APP_ENV:', import.meta.env.VITE_APP_ENV);
}

if (import.meta.env.PROD) {
  console.info('[Cuaderno] Supabase host:', getSupabasePublicHost());
  if (isDemoApp()) {
    console.info('[Cuaderno DEMO] Aislamiento activo — ref REAL bloqueado en cliente.');
  }
}

// Registrar Service Worker tras el primer paint (no compite con carga JS)
function registerAppServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((reg) => {
      console.log('[SW] Registrado:', reg.scope);
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            window.__newVersionAvailable?.();
          }
        });
      });
    })
    .catch((err) => console.warn('[SW] Error:', err));
}
if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(registerAppServiceWorker, { timeout: 4000 });
} else {
  setTimeout(registerAppServiceWorker, 2000);
}

// Detectar si está instalada como PWA
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

if (isStandalone) {
  document.documentElement.classList.add('pwa-standalone');
}

// Montar React
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);

// Ocultar splash
window.__hideSplash?.();
