const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:3334/btc-weather-panel/', { waitUntil: 'networkidle2', timeout: 60000 });

  const info = await page.evaluate(() => {
    const btn = document.getElementById('theme-toggle');
    const dd = document.getElementById('theme-dropdown');
    const r = btn.getBoundingClientRect();
    return {
      btnRect: { x: r.x, y: r.y, w: r.width, h: r.height },
      btnVisible: r.width > 0 && r.height > 0,
      btnDisplay: getComputedStyle(btn).display,
      ddHidden: dd.classList.contains('hidden'),
      bodyTheme: document.body.getAttribute('data-theme'),
      lenOpcoes: dd.querySelectorAll('.lang-option').length
    };
  });
  console.log('INFO:', JSON.stringify(info));

  // tenta clique real
  try {
    await page.click('#theme-toggle');
  } catch (e) {
    console.log('page.click falhou:', e.message.slice(0, 120));
  }
  await new Promise(r => setTimeout(r, 500));
  const after = await page.evaluate(() => ({
    ddHidden: document.getElementById('theme-dropdown').classList.contains('hidden'),
    openClass: document.getElementById('theme-toggle').classList.contains('open')
  }));
  console.log('APÓS page.click:', JSON.stringify(after));

  // tenta clique via evaluate diretamente no handler (dispatch)
  await page.evaluate(() => document.getElementById('theme-toggle').click());
  await new Promise(r => setTimeout(r, 500));
  const afterEval = await page.evaluate(() => ({
    ddHidden: document.getElementById('theme-dropdown').classList.contains('hidden'),
    openClass: document.getElementById('theme-toggle').classList.contains('open')
  }));
  console.log('APÓS evaluate click:', JSON.stringify(afterEval));

  await browser.close();
})();
