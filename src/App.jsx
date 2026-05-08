// Inicializar el adaptador de almacenamiento ANTES de importar el componente
// Esto expone window.storage globalmente para compatibilidad
import './storage.js';

// Importar el componente principal
// (copiar cuaderno-ruta.jsx en esta misma carpeta src/)
import CuadernoRuta from './cuaderno-ruta.jsx';

export default CuadernoRuta;
