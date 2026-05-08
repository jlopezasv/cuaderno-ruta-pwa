import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// Registrar Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(reg => {
        console.log('[SW] Registrado:', reg.scope);
        // Detectar actualizaciones
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Nueva versión disponible — mostrar toast
              window.__newVersionAvailable?.();
            }
          });
        });
      })
      .catch(err => console.warn('[SW] Error:', err));
  });
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
