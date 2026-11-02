// Convertit les SVG de couverture en PNG 1200×700 (Playwright / Chromium).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const [src, out] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.svg'))) {
    await page.setContent(`<html><body style="margin:0">${fs.readFileSync(path.join(src, f), 'utf8')}</body></html>`);
    await page.screenshot({ path: path.join(out, f.replace('.svg', '.jpg')), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 1200, height: 700 } });
  }
  await browser.close();
})();
