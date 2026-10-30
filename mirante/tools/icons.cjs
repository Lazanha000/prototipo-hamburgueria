// Gera os ícones PNG do app a partir do icon.svg (usa o Chromium do Playwright).
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const [src, out] = process.argv.slice(2);
  const svg = fs.readFileSync(src, "utf8");
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const s of [192, 512]) {
    await p.setViewportSize({ width: s, height: s });
    await p.setContent(`<html><body style="margin:0">${svg.replace("<svg ", `<svg width="${s}" height="${s}" `)}</body></html>`);
    await p.screenshot({ path: `${out}/icon-${s}.png` });
  }
  await b.close();
})();
