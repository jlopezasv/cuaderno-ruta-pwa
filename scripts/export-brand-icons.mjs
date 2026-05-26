/**
 * Exporta PNG del icono maestro SVG para PWA / iOS / Android.
 * Uso: node scripts/export-brand-icons.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const masterSvg = path.join(root, "public", "brand", "logo-icon-master.svg");
const iconsDir = path.join(root, "public", "icons");

const exports = [
  { name: "icon-1024.png", size: 1024, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "icon-512-maskable.png", size: 512, maskable: true },
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "apple-touch-icon-180.png", size: 180, maskable: false },
  { name: "favicon-96.png", size: 96, maskable: false },
  { name: "favicon-32.png", size: 32, maskable: false },
];

async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    const { execSync } = await import("child_process");
    execSync("npm install sharp --no-save", { cwd: root, stdio: "inherit" });
    return (await import("sharp")).default;
  }
}

function maskableSvg(svgText) {
  return svgText.replace(
    /<svg([^>]*)>/,
    '<svg$1><rect width="512" height="512" fill="#FFFFFF"/><g transform="translate(51.2 51.2) scale(0.8)">',
  ).replace("</svg>", "</g></svg>");
}

async function main() {
  if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });
  const sharp = await loadSharp();
  const svgBase = fs.readFileSync(masterSvg, "utf8");

  for (const item of exports) {
    const svg = item.maskable ? maskableSvg(svgBase) : svgBase;
    const out = path.join(iconsDir, item.name);
    await sharp(Buffer.from(svg)).resize(item.size, item.size).png().toFile(out);
    console.log(`✓ ${item.name} (${item.size}px)`);
  }

  // Copia maestro en favicon raíz (96) para compatibilidad
  fs.copyFileSync(path.join(iconsDir, "favicon-96.png"), path.join(root, "public", "favicon-96.png"));
  console.log("✓ public/favicon-96.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
