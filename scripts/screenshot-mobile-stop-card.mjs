import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "preview-conductor-fixes-mobile.html");
const outPath = path.join(__dirname, "..", "mobile-conductor-fixes-375px.png");

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
});
await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`);
await page.waitForTimeout(300);
await page.screenshot({ path: outPath, fullPage: true });
await browser.close();
console.log(`Screenshot saved: ${outPath}`);
