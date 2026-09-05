const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE_ERROR: ' + e.message));
  await page.goto('http://127.0.0.1:3334/btc-weather-panel/', { waitUntil: 'networkidle2', timeout: 60000 });

  // limpa tema salvo para testar desde zero
  await page.evaluate(() => localStorage.removeItem('btc_weather_theme'));

  // clique real no botão
  await page.click('#theme-toggle');
  await new Promise(r => setTimeout(r, 300));
  const visAposToggle = await page.evaluate(() => !document.getElementById('theme-dropdown').classList.contains('hidden'));
  console.log('dropdown abre ao clicar no toggle:', visAposToggle);

  // clique real na opção Neon
  await page.waitForSelector('.theme-dropdown .lang-option[data-theme="neon"]', { visible: true });
  await page.click('.theme-dropdown .lang-option[data-theme="neon"]');
  await new Promise(r => setTimeout(r, 400));
  console.log('tema Neon aplicado:', await page.evaluate(() => document.body.getAttribute('data-theme')));

  // o dropdown fechou?
  const fechou = await page.evaluate(() => document.getElementById('theme-dropdown').classList.contains('hidden'));
  console.log('dropdown fechou após seleção:', fechou);

  // click fora deve fechar
  await page.click('#theme-toggle');
  await new Promise(r => setTimeout(r, 200));
  await page.mouse.click(5, 5);
  await new Promise(r => setTimeout(r, 300));
  const fechouFora = await page.evaluate(() => document.getElementById('theme-dropdown').classList.contains('hidden'));
  console.log('dropdown fecha ao clicar fora:', fechouFora);

  // captura screenshot de cada tema para o usuário ver
  const themes = ['glass', 'neon', 'minimal'];
  for (const t of themes) {
    await page.evaluate((th) => {
      document.body.setAttribute('data-theme', th);
    }, t);
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: '/root/severino/theme-' + t + '.png', fullPage: false });
    console.log('screenshot theme-' + t + '.png');
  }

  console.log('ERROS:', errors.length ? errors.join(' | ') : 'nenhum');
  await browser.close();
})();
