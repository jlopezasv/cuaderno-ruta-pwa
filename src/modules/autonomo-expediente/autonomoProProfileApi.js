import { sbUpsert } from "../../data/supabaseClient.js";

/** Guarda datos DeCA editados en profiles (solo si el usuario lo pide). */
export async function saveAutonomoProProfileFromDeca(uid, { transportista, conductor, vehiculo, profile = {} }) {
  if (!uid) return;
  const patch = {
    id: uid,
    updated_at: new Date().toISOString(),
  };
  if (transportista?.nombre) patch.empresa = transportista.nombre;
  if (transportista?.nif) patch.cif = transportista.nif;
  if (conductor?.nombre) patch.nombre = conductor.nombre;
  if (conductor?.dni) patch.dni = conductor.dni;
  if (conductor?.telefono) patch.telefono = conductor.telefono;
  if (vehiculo?.matricula != null) patch.matricula = vehiculo.matricula || null;
  if (vehiculo?.remolque != null) patch.remolque = vehiculo.remolque || null;
  await sbUpsert("profiles", [patch]).catch(() => {});
  return {
    ...profile,
    empresa: patch.empresa ?? profile.empresa,
    cif: patch.cif ?? profile.cif,
    nombre: patch.nombre ?? profile.nombre,
    dni: patch.dni ?? profile.dni,
    telefono: patch.telefono ?? profile.telefono,
    matricula: patch.matricula ?? profile.matricula,
    remolque: patch.remolque ?? profile.remolque,
  };
}
