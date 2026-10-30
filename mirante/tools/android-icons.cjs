// Gera os ícones do app Android a partir do logo (usa o Chromium do Playwright).
// Uso: NODE_PATH=$(npm root -g) node tools/android-icons.cjs
const { chromium } = require("playwright");
const fs = require("fs");
const res = "app/android/app/src/main/res";
const logo = `<path d="M16 4 9 13h14z" fill="#B5603F" stroke="#1D2B36" stroke-width="1.6" stroke-linejoin="round"/><path d="M11 13h10l2 15H9z" fill="#F8FAF7" stroke="#1D2B36" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 28v-6h4v6" fill="none" stroke="#1D2B36" stroke-width="1.4"/><circle cx="25.5" cy="7" r="3" fill="#E3B23C"/>`;
const svg = (px, { bg, round, scale }) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 32 32">
  ${bg ? `<${round ? 'circle cx="16" cy="16" r="16"' : 'rect width="32" height="32" rx="6"'} fill="#EEF1EC"/>` : ""}
  <g transform="translate(16 16) scale(${scale}) translate(-16 -16)">${logo}</g></svg>`;
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const shot = async (px, opts, file) => {
    await p.setViewportSize({ width: px, height: px });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg(px, opts)}</body></html>`);
    await p.screenshot({ path: file, omitBackground: true });
  };
  for (const [name, k] of Object.entries(dens)) {
    await shot(48 * k, { bg: true, round: false, scale: 0.92 }, `${res}/mipmap-${name}/ic_launcher.png`);
    await shot(48 * k, { bg: true, round: true, scale: 0.8 }, `${res}/mipmap-${name}/ic_launcher_round.png`);
    await shot(108 * k, { bg: false, scale: 0.62 }, `${res}/mipmap-${name}/ic_launcher_foreground.png`);  // zona segura do ícone adaptativo
  }
  fs.writeFileSync(`${res}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#EEF1EC</color>\n</resources>\n`);
  await b.close();
})();
