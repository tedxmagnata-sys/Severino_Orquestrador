const http = require('http');
const https = require('https');
const fs = require('fs');

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const CBTC = '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf';
const VAULT = '0x17ccb86bcad08db4bbb13827b609e8bd632f89b5'.toLowerCase();
const PAD = '0x70a08231000000000000000000000000' + VAULT.slice(2);
const RPC = 'https://mainnet.base.org';

function rpcCall(to) {
  return new Promise(r => {
    const b = JSON.stringify({jsonrpc:'2.0',method:'eth_call',params:[{to,data:PAD},'latest'],id:1});
    const q = https.request(RPC, {method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}}, res => {
      let d = ''; res.on('data',c=>d+=c); res.on('end',()=>{try{r(JSON.parse(d))}catch(e){r(null)}});
    });
    q.write(b); q.end(); q.setTimeout(5000,()=>{q.destroy();r(null)});
  });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/dca/status') {
    Promise.all([rpcCall(USDC), rpcCall(CBTC)]).then(([r1,r2]) => {
      const usdc = r1&&r1.result&&r1.result!=='0x'?parseInt(r1.result,16)/1e6:0;
      const cbbtc = r2&&r2.result&&r2.result!=='0x'?parseInt(r2.result,16)/1e8:0;
      let d = 0, totalInv = 0;
      try {
        const w = JSON.parse(fs.readFileSync('/root/severino/ecosystem/data/wow-state.json','utf8'));
        const trades = w.trades || [];
        if (trades.length) {
          d = Math.floor((Date.now()-new Date(trades[trades.length-1].data).getTime())/86400000);
          totalInv = trades.reduce((s,t)=>s+(t.valor||0), 0);
        }
        var ts = w.totalSacado || 0;
        var tr = (w.trades || []).map(t => ({data:t.data,valor:t.valor,precoBTC:t.precoBTC,wowScore:t.wowScore}));
      } catch(e) {}
      res.setHeader('Access-Control-Allow-Origin','*');
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({usdc,cbbtc,totalDepositado:totalInv,totalSacado:ts,trades:tr,diasSemDCA:d,maxDiasSemComprar:6,podeSacar:cbbtc>1e-6}));
    }).catch(() => {
      res.setHeader('Access-Control-Allow-Origin','*');
      res.end(JSON.stringify({usdc:0,cbbtc:0,totalDepositado:99.97,totalSacado:0,trades:[],diasSemDCA:0,maxDiasSemComprar:6,podeSacar:false}));
    });
    return;
  }
  if (req.url === '/api/dca/history') {
    try {
      const w = JSON.parse(require('fs').readFileSync('/root/severino/ecosystem/data/wow-state.json','utf8'));
      const trades = (w.trades || []).filter(t => t.txHash && t.txHash !== '0xSIMULATED');
      res.setHeader('Access-Control-Allow-Origin','*');
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({trades}));
    } catch(e) {
      res.setHeader('Access-Control-Allow-Origin','*');
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({trades:[]}));
    }
    return;
  }
  if (req.url === '/api/jev/analysis') {
    const jevKey = require('fs').readFileSync('/root/severino/.env','utf8').match(/JEV_API_KEY=(.+)/)?.[1]?.trim();
    if (!jevKey) { res.writeHead(500); res.end(JSON.stringify({erro:'Sem JEV_KEY'})); return; }
    
    // Buscar dados de mercado
    Promise.all([
      new Promise(r => { https.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true', {headers:{'User-Agent':'Mozilla/5.0'}}, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{r(JSON.parse(d).bitcoin)}catch(e){r(null)}})}).on('error',()=>r(null)); }),
      new Promise(r => { https.get('https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=3', {headers:{'User-Agent':'Mozilla/5.0'}}, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{r(JSON.parse(d))}catch(e){r(null)}})}).on('error',()=>r(null)); })
    ]).then(([btc, ohlc]) => {
      if (!btc || !ohlc) { res.writeHead(200); res.end(JSON.stringify({erro:'Sem dados',jev:{}})); return; }
      
      // Calcular RSI
      const prices = ohlc.map(c => c[4]);
      const rsis = (() => { const p=prices,g=[],l=[];for(let i=1;i<p.length;i++){const d=p[i]-p[i-1];g.push(d>0?d:0);l.push(d<0?-d:0)}const r=[];let a=g.slice(0,14).reduce((s,v)=>s+v,0)/14,il=l.slice(0,14).reduce((s,v)=>s+v,0)/14;for(let i=14;i<g.length;i++){r.push(il===0?100:100-100/(1+a/il));a=(a*13+g[i])/14;il=(il*13+l[i])/14}return r;})();
      const rsi = rsis.length ? rsis[rsis.length-1] : 50;
      const preco = btc.usd;
      const variacao = btc.usd_24h_change || 0;
      
      // Calcular BB
      const period = 20;
      const bbs = (() => { const r=[]; for(let i=period-1;i<prices.length;i++){const s=prices.slice(i-period+1,i+1);const m=s.reduce((a,b)=>a+b,0)/period;const v=s.reduce((a,b)=>a+(b-m)**2,0)/period;const std=Math.sqrt(v);r.push({upper:m+2*std,middle:m,lower:m-2*std})}return r;})();
      const bb = bbs.length ? bbs[bbs.length-1] : null;
      const bbPos = bb ? ((preco - bb.lower) / (bb.upper - bb.lower) * 100) : 50;
      
      // Calcular MACD
      const ema = (data, period) => { const k=2/(period+1); let e=data.slice(0,period).reduce((a,b)=>a+b,0)/period; for(let i=period;i<data.length;i++) e=data[i]*k+e*(1-k); return e; };
      const macd = (() => { const f=ema(prices,12), s=ema(prices,26); return f - s; })();
      const macdSignal = ema(prices.slice(-9), 9);
      const macdHist = macd - macdSignal;
      
      // State pra JEV
      const state = {
        btc_preco_usd: Math.round(preco),
        btc_variacao_24h_pct: variacao.toFixed(2),
        rsi_14: Math.round(rsi),
        bb_position_pct: Math.round(bbPos),
        macd_histogram: Math.round(macdHist),
        volume_relativo: variacao > 3 ? 'alto' : variacao < -3 ? 'alto' : 'normal'
      };
      
      // Chamar JEV
      const body = JSON.stringify({
        model: 'jev-latest',
        state,
        questions: {
          sinal: { type: 'choice', instructions: 'Sinal do mercado Bitcoin agora', criteria: { options: ['PLANTAR', 'CULTIVAR', 'COLHER'] } },
          risco: { type: 'choice', instructions: 'Nivel de risco', criteria: { options: ['BAIXO', 'MEDIO', 'ALTO', 'EXTREMO'] } },
          tendencia: { type: 'choice', instructions: 'Tendencia de curto prazo', criteria: { options: ['ALTA', 'BAIXA', 'LATERAL'] } },
          comprar: { type: 'noul', instructions: 'Momento de comprar BTC?' }
        }
      });
      
      https.request('https://api.typesafe.ai/v1/systemone', {method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+jevKey}}, r => {
        let d=''; r.on('data',c=>d+=c); r.on('end',()=>{
          try {
            const j = JSON.parse(d).answers || {};
            res.setHeader('Access-Control-Allow-Origin','*');
            res.writeHead(200,{'Content-Type':'application/json'});
            res.end(JSON.stringify({
              btc:{preco, variacao, rsi, bbPos:Math.round(bbPos)},
              jev:{sinal:j.sinal?.choice||'?', risco:j.risco?.choice||'?', tendencia:j.tendencia?.choice||'?', comprar:Math.round((j.comprar?.noul||0)*100)},
              state
            }));
          } catch(e) {
            res.writeHead(200); res.end(JSON.stringify({erro:e.message,jev:{}}));
          }
        });
      }).end(body);
    }).catch(e => { res.writeHead(500); res.end(JSON.stringify({erro:e.message})); });
    return;
  }
  res.writeHead(404); res.end();
});

const PORT = 3351;
server.listen(PORT, () => console.log('dca-monitor on :'+PORT));