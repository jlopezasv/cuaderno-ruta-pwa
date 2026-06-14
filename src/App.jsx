import { lazy, Suspense, useMemo } from 'react';
// Inicializar el adaptador de almacenamiento ANTES del bundle principal
import './storage.js';
import { parseDcdtVerifyTokenFromLocation } from './domain/dcdt/dcdtVerifyToken.js';
import { DcdtVerifyPublicPage } from './features/dcdt/DcdtVerifyPublicPage.jsx';

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
  const verifyToken = useMemo(() => parseDcdtVerifyTokenFromLocation(), []);

  if (verifyToken) {
    return <DcdtVerifyPublicPage token={verifyToken} />;
  }

  return (
    <Suspense fallback={<AppLoading />}>
      <CuadernoRuta />
    </Suspense>
  );
}
