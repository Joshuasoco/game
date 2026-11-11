import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const output = resolve('docs/screenshots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await desktop.newPage();
const captures = [];
async function capture(target, name, title, mobile = false) {
  await target.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
  captures.push({ name, title, mobile });
}
try {
  await page.goto('http://localhost:5173/');
  await page.getByRole('button', { name: 'Play with your phone' }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('.scene-loading') && !document.querySelector('.primary-button')?.disabled);
  await page.evaluate(() => document.fonts.ready);
  await capture(page, '01-start', '01 / Start screen');
  await page.getByRole('button', { name: 'How to play' }).click();
  await capture(page, '02-how-to-play', '02 / How to play');
  await page.getByRole('button', { name: 'Got it. Let’s play.' }).click();
  await page.getByRole('button', { name: 'Play with your phone' }).click();
  await page.locator('.qr').waitFor();
  await capture(page, '03-phone-pairing', '03 / Pair your phone');
  const code = await page.locator('.room-code').textContent();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const phone = await mobile.newPage();
  await phone.goto(`http://localhost:5173/c?room=${code}`);
  await phone.getByRole('button', { name: 'I’d rather use touch controls' }).waitFor();
  await capture(phone, '04-phone-welcome', '04 / Phone welcome', true);
  await phone.getByRole('button', { name: 'I’d rather use touch controls' }).click();
  await capture(phone, '05-calibration', '05 / Practice & calibration', true);
  for (let i = 0; i < 3; i++) await phone.getByRole('button', { name: 'Tap to swing' }).click();
  await page.getByRole('heading', { name: 'Your serve.' }).waitFor();
  await capture(page, '06-serve', '06 / Ready to serve');
  await capture(phone, '07-phone-controller', '07 / Phone controller', true);
  await phone.getByRole('button', { name: 'Tap to swing' }).click();
  await page.waitForTimeout(350);
  await capture(page, '08-gameplay', '08 / Live gameplay');
  await phone.getByRole('button', { name: 'Pause match' }).click();
  await page.getByRole('heading', { name: 'A little breather.' }).waitFor();
  await capture(page, '09-pause', '09 / Pause screen');
  const cards = await Promise.all(captures.map(async ({ name, title, mobile }) => `<article><div class="image ${mobile ? 'mobile' : ''}"><img src="data:image/png;base64,${(await readFile(resolve(output, `${name}.png`))).toString('base64')}" alt="${title}"/></div><h2>${title}</h2></article>`));
  await writeFile(resolve(output, 'gallery.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Dink Duel — Game screens</title><style>*{box-sizing:border-box}body{margin:0;padding:48px;background:#f6f7ef;color:#244c3e;font-family:Arial,sans-serif}header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:30px}h1{font-size:48px;letter-spacing:-2px;margin:0}header p{font-size:14px;color:#7b8578;margin:10px 0 0}.tag{font-size:11px;letter-spacing:2px;color:#7b8578}main{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}article{margin:0;background:#fffef8;border:1px solid #dce3d3;border-radius:12px;overflow:hidden}.image{height:380px;display:flex;align-items:center;justify-content:center;background:#e8eedf;padding:0}.image img{width:100%;height:100%;object-fit:contain}.image.mobile{background:#e1e7d5;padding:14px}.image.mobile img{width:auto;max-width:100%;border-radius:12px;box-shadow:0 5px 22px #244c3e22}h2{font-size:13px;font-weight:600;margin:0;padding:17px 19px;border-top:1px solid #e0e5d7}footer{padding-top:25px;color:#7b8578;font-size:12px}</style></head><body><header><div><h1>dinkduel.</h1><p>Small court. Big energy. — A tour of the game</p></div><span class="tag">ACTUAL GAME SCREENSHOTS</span></header><main>${cards.join('')}</main><footer>Desktop game · Phone pairing · Touch controller · Practice · Gameplay</footer></body></html>`);
  const gallery = await browser.newPage({ viewport: { width: 1800, height: 1600 }, deviceScaleFactor: 1 });
  await gallery.goto(pathToFileURL(resolve(output, 'gallery.html')).href);
  await gallery.screenshot({ path: resolve(output, 'all-game-screens.png'), fullPage: true });
  console.log(`Saved ${captures.length} screenshots and overview to ${output}`);
} finally { await browser.close(); }
