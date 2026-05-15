import { lazy, Suspense } from 'react';
// Inicializar el adaptador de almacenamiento ANTES del bundle principal
import './storage.js';

const CuadernoRuta = lazy(() => import('./cuaderno-ruta.jsx'));

function AppLoading() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 15,
        fontWeight: 600,
      }}
    >
      Cargando Cuaderno de Ruta…
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<AppLoading />}>
      <CuadernoRuta />
    </Suspense>
  );
}
