// ==========================================================================
// BTC WEATHER PANEL - THEME SWITCHER (Glass / Neon / Minimal)
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const THEMES = ['glass', 'neon', 'minimal'];
    let currentTheme = 'glass';
    try { currentTheme = localStorage.getItem('btc_weather_theme') || 'glass'; } catch (e) {}
    if (!THEMES.includes(currentTheme)) currentTheme = 'glass';

    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeDropdown = document.getElementById('theme-dropdown');
    const themeCurrentLabel = document.getElementById('theme-current-label');

    function applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        if (themeCurrentLabel) themeCurrentLabel.textContent = theme;
        document.querySelectorAll('.theme-dropdown .lang-option').forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('data-theme') === theme);
        });
        if (window.lucide) window.lucide.createIcons();
    }

    if (themeToggleBtn && themeDropdown) {
        themeToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = themeDropdown.classList.contains('hidden');
            themeDropdown.classList.toggle('hidden', !isOpen);
            themeToggleBtn.classList.toggle('open', isOpen);
            themeToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
        themeDropdown.addEventListener('click', (e) => {
            const opt = e.target.closest('.lang-option');
            if (!opt) return;
            const theme = opt.getAttribute('data-theme');
            if (THEMES.includes(theme)) {
                currentTheme = theme;
                try { localStorage.setItem('btc_weather_theme', theme); } catch (err) {}
                applyTheme(theme);
            }
            themeDropdown.classList.add('hidden');
            themeToggleBtn.classList.remove('open');
            themeToggleBtn.setAttribute('aria-expanded', 'false');
        });
        document.addEventListener('click', (e) => {
            const sw = document.getElementById('theme-switcher');
            if (sw && !sw.contains(e.target)) {
                themeDropdown.classList.add('hidden');
                themeToggleBtn.classList.remove('open');
                themeToggleBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // Aplica o tema salvo (o mais cedo possível também no index.js, via data-theme)
    applyTheme(currentTheme);
});
