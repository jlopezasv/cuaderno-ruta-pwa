#!/usr/bin/env node
/**
 * Verifica PDF DeCA generado con pdf-lib (estructura + metadatos + tamaño).
 * Uso: node scripts/verify-deca-pdf.mjs [ruta.pdf]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PDFDocument } from "pdf-lib";
import { buildDecaDownloadUrl } from "../src/domain/dcdt/decaUrl.js";
import { generateDecaQrPngBytes } from "../src/domain/dcdt/decaQrImage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const sampleDoc = {
  referencia: "SRV-TEST",
  cargador: { nombre: "Cargador SA", nif: "B12345678", domicilio: "Calle Mayor 1, Madrid" },
  transportista: { nombre: "Transportes Demo SL", nif: "B87654321", domicilio: "Poligono 5" },
  destinatario: { nombre: "Destinatario SL", nif: "B11111111", domicilio: "Av. Sur 2" },
  origen: "Madrid",
  destino: "Barcelona",
  mercancia: { descripcion: "Palets alimentacion", peso_kg: 1200, bultos: 10, palets: 5 },
  fecha_transporte: "2026-06-01T08:00:00.000Z",
  vehiculo: { matricula: "1234ABC", remolque: "R5678BC" },
  observaciones: "Sin incidencias",
  validado_at: "2026-06-01T10:00:00.000Z",
};

async function main() {
  const inputPath = process.argv[2] ? resolve(process.argv[2]) : null;

  let bytes;
  if (inputPath) {
    bytes = readFileSync(inputPath);
    console.log("Archivo:", inputPath);
  } else {
    const mod = await import(pathToFileURL(resolve(root, "src/domain/dcdt/dcdtPdfBuilder.js")).href);
    const testId = "698a6983-47dc-475e-b5ad-fcb150519744";
    process.env.VITE_DECA_PUBLIC_BASE_URL =
      process.env.VITE_DECA_PUBLIC_BASE_URL || "https://cuaderno-demo-ab.vercel.app";
    const downloadUrl = buildDecaDownloadUrl(testId);
    const qrPngBytes = await generateDecaQrPngBytes(downloadUrl);
    const blob = await mod.buildDcdtPdfBlob(sampleDoc, {
      creationDate: "2026-05-20T12:00:00.000Z",
      qrPngBytes,
    });
    bytes = Buffer.from(await blob.arrayBuffer());
    const outDir = resolve(root, "tmp");
    mkdirSync(outDir, { recursive: true });
    const outPath = resolve(outDir, "deca-sample-qr.pdf");
    writeFileSync(outPath, bytes);
    console.log("Generado:", outPath);
    console.log("QR URL embebida:", downloadUrl);
  }

  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const title = pdf.getTitle();
  const creator = pdf.getCreator();
  const producer = pdf.getProducer();
  const created = pdf.getCreationDate();
  const modified = pdf.getModificationDate();
  const pages = pdf.getPageCount();

  console.log("\n--- Validacion ---");
  console.log("Tamano:", bytes.length, "bytes", `(${(bytes.length / 1024).toFixed(1)} KB)`);
  console.log("Paginas:", pages);
  console.log("Title:", title);
  console.log("Creator:", creator);
  console.log("Producer:", producer);
  console.log("CreationDate:", created?.toISOString?.() || created);
  console.log("ModificationDate:", modified?.toISOString?.() || modified);
  console.log("Max 5MB:", bytes.length <= 5 * 1024 * 1024 ? "OK" : "FAIL");
  console.log("\nPDF cargado correctamente por pdf-lib (estructura valida).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
