import { ServicioMercanciaBlock } from "./ServicioMercanciaBlock.jsx";

/** Mercancía por parada de carga (persiste en __CUADERNO_OP__.mercancia). */
export function CargaMercanciaFields({ stop, index, onChange, themeKey = "empresa" }) {
  if (String(stop?.tipo || "").toLowerCase() !== "carga") return null;

  const value = stop?.mercancia || {
    descripcion: "",
    palets: "",
    bultos: "",
    peso_kg: "",
  };

  return (
    <ServicioMercanciaBlock
      value={value}
      themeKey={themeKey}
      onChange={(next) => onChange?.(index, "mercancia", next)}
    />
  );
}
