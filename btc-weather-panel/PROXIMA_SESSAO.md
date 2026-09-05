# 🔥 BTC Weather Panel v13 — Próxima Sessão

**Data do plano:** 13 de Julho de 2026 — 17:56 (Brasília)
**Status atual:** v12 deployada e funcionando. Descrições dos cards persistem corretamente.

---

## O Que Implementar (ordem exata)

### #1 — Widget "Decisão em 1 Segundo" (~1h)
Banner fixo ABAIXO do header, ACIMA do dashboard-grid.
- Mostra sinal consolidado + score + preço BTC em tempo real
- Fundo colorido: Verde (COMPRA FORTE/COMPRA) | Cinza (NEUTRO) | Laranja (VENDA) | Vermelho (VENDA FORTE)
- Formato: "🟢 MOMENTO DE COMPRA — Score +1.33 | BTC $63,480"
- Atualiza a cada ciclo do micro-tick (2.5s)
- ID sugerido: #action-banner
- Sempre visível, sem precisar rolar a tela

### #2 — Notificação Nativa do Navegador (~2h)
Usar Web Notifications API (zero backend):
- Na primeira visita: pedir permissão com botão amigável no banner
- Detectar mudança de categoria do sinal (NEUTRO → COMPRA, etc.)
- Salvar categoria atual em variável: let lastSignalCategory = null
- Quando mudar: new Notification('BTC Weather Alert', { body: '...', icon: '...' })
- NÃO notificar no carregamento inicial, só em mudanças reais

### #3 — Som Automático na Mudança de Categoria (~30min)
Aproveita playSoundAlert() já existente:
- Comparar lastSignalCategory com novo valor no micro-tick
- Se mudar para COMPRA/COMPRA FORTE → playSoundAlert('bullish')
- Se mudar para VENDA/VENDA FORTE → playSoundAlert('bearish')
- Se mudar para NEUTRO → playSoundAlert('neutral')
- Implementar JUNTO com #2 (compartilham a detecção de mudança)

---

## Arquivos a editar
- index.html → adicionar #action-banner no HTML (logo após a tag <header>, antes de .dashboard-grid)
- index.js   → lógica dos 3 recursos (lastSignalCategory, detecção de mudança, Notification API)
- index.css  → estilo do banner (#action-banner com transição suave de cor)

## Deploy
```
python C:\Users\3\Ted\CryptoTradingAgent\scratch\deploy_weather_panel.py
```

## Referência de variáveis relevantes em index.js
- activeTimeframe       → linha ~55
- lastWeatherStatus     → linha ~56
- playSoundAlert(type)  → linha ~122 (bullish / bearish / neutral)
- changeWeatherTheme()  → linha ~169
- updateThermometerUI() → linha ~484
- micro-tick setInterval → linha ~636 (a cada 2500ms) — AQUI entra a detecção de mudança
- avgScore              → calculado dentro de updateThermometerUI(), determina o sinal consolidado

## Lógica central a implementar em updateThermometerUI()
```js
// Detecta mudança de categoria de sinal e dispara alerta
const newCategory = getSignalCategory(avgScore); // ex: 'COMPRA FORTE'
if (lastSignalCategory !== null && lastSignalCategory !== newCategory) {
    triggerSignalAlert(newCategory); // som + notificação
}
lastSignalCategory = newCategory;

// Atualiza banner de ação imediata
updateActionBanner(newCategory, avgScore);
```
