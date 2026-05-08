// Genera los iconos PWA como SVGs (ejecutar una vez con: node src/generate-icons.mjs)
import fs from 'fs';
import path from 'path';

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

function makeSVG(size) {
  const pad = Math.round(size * 0.12);
  const r = Math.round(size * 0.22);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="#0F172A"/>
  <rect x="${pad}" y="${pad}" width="${size-pad*2}" height="${size-pad*2}" rx="${Math.round(r*0.7)}" fill="#1E293B"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="${Math.round(size*0.48)}" font-family="Apple Color Emoji,Segoe UI Emoji,sans-serif">📋</text>
  <rect x="${pad}" y="${size-pad*2.2}" width="${size-pad*2}" height="${Math.round(size*0.06)}" rx="3" fill="#F59E0B"/>
</svg>`;
}

const iconsDir = path.join(process.cwd(), 'public', 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

sizes.forEach(sz => {
  const svgPath = path.join(iconsDir, `icon-${sz}.svg`);
  fs.writeFileSync(svgPath, makeSVG(sz));
  console.log(`✓ icon-${sz}.svg`);
});

// También crear un favicon.svg
fs.writeFileSync(path.join(process.cwd(), 'public', 'favicon.svg'), makeSVG(64));
console.log('✓ favicon.svg');
console.log('\nIconos SVG generados. Para PNG usa: npx sharp-cli ...');
console.log('O usa https://favicon.io para convertir el emoji 📋 a PNG en todos los tamaños.');
