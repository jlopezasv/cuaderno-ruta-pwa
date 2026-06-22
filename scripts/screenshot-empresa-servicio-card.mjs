import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "preview-empresa-servicio-card-horizontal.html");
const outPath = path.join(__dirname, "..", "empresa-servicio-card-horizontal-preview.png");

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1100, height: 720 },
  deviceScaleFactor: 2,
});
await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`);
await page.waitForTimeout(800);
await page.screenshot({ path: outPath, fullPage: true });
await browser.close();
console.log(`Screenshot saved: ${outPath}`);
