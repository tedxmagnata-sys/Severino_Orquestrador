const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE_ERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('http://127.0.0.1:3334/btc-weather-panel/', { waitUntil: 'networkidle2', timeout: 60000 });

  const hasThemeToggle = await page.evaluate(() => !!document.getElementById('theme-toggle'));
  console.log('theme-toggle existe:', hasThemeToggle);

  const initialTheme = await page.evaluate(() => document.body.getAttribute('data-theme'));
  console.log('tema inicial:', initialTheme);

  // Abre o dropdown e clica em Neon
  await page.evaluate(() => document.getElementById('theme-toggle').click());
  const dropdownVisible = await page.evaluate(() => !document.getElementById('theme-dropdown').classList.contains('hidden'));
  console.log('dropdown visível:', dropdownVisible);

  await page.evaluate(() => {
    const opt = document.querySelector('.theme-dropdown .lang-option[data-theme="neon"]');
    opt.click();
  });
  await new Promise(r => setTimeout(r, 500));
  const themeNeon = await page.evaluate(() => document.body.getAttribute('data-theme'));
  console.log('tema após clique Neon:', themeNeon);
  const savedNeon = await page.evaluate(() => localStorage.getItem('btc_weather_theme'));
  console.log('localStorage:', savedNeon);

  // Recarrega para confirmar persistência
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  const themeReload = await page.evaluate(() => document.body.getAttribute('data-theme'));
  console.log('tema após reload:', themeReload);

  // Troca para Minimal
  await page.evaluate(() => document.getElementById('theme-toggle').click());
  await page.evaluate(() => {
    const opt = document.querySelector('.theme-dropdown .lang-option[data-theme="minimal"]');
    opt.click();
  });
  await new Promise(r => setTimeout(r, 300));
  console.log('tema Minimal:', await page.evaluate(() => document.body.getAttribute('data-theme')));

  // Troca para Glass
  await page.evaluate(() => document.getElementById('theme-toggle').click());
  await page.evaluate(() => {
    const opt = document.querySelector('.theme-dropdown .lang-option[data-theme="glass"]');
    opt.click();
  });
  await new Promise(r => setTimeout(r, 300));
  console.log('tema Glass:', await page.evaluate(() => document.body.getAttribute('data-theme')));

  console.log('ERROS:', errors.length ? errors.join(' | ') : 'nenhum');
  await browser.close();
})();
