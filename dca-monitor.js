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
    const q = https.request(RPC, {method:'POST',headers:{'Content-Type':'application/json'}}, res => {
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
      
      // Read state (sync)
      let d = 0, tr = [], totalDepositados = 0, ts = 0, tx = 0;
      let w = {};
      try {
        w = JSON.parse(fs.readFileSync('/root/severino/ecosystem/data/wow-state.json','utf8'));
        const trades = w.trades || [];
        if (trades.length) {
          d = Math.floor((Date.now()-new Date(trades[trades.length-1].data).getTime())/86400000);
        }
        totalDepositados = (w.depositos || []).reduce((s,t)=>s+(t.valor||0), 0);
        ts = w.totalSacado || 0;
        tr = (w.trades || []).map(t => ({data:t.data,valor:t.valor,precoBTC:t.precoBTC,wowScore:t.wowScore}));
        tx = w.totalTaxas || 0;
      } catch(e) {}
      
      // Fetch BTC price then respond
      const http = require('https');
      
      function sendResponse(res, usdc, cbbtc, precoBTC, w, d, tr, totalDepositados, ts, tx) {
        const valorContrato = usdc + cbbtc * precoBTC;
        const totalSacadoUSD = (w.saques || []).reduce((s,t)=>s+(t.valor||0), 0);
        const valorWallet = totalSacadoUSD;
        const valorTotal = valorContrato + valorWallet;
        
        // P&L metrics
        const trades = w.trades || [];
        const totalBTC = trades.reduce((s,t)=>s+(t.valor/t.precoBTC), 0);
        const investidoTrades = trades.reduce((s,t)=>s+t.valor, 0);
        const precoMedio = totalBTC > 0 ? investidoTrades / totalBTC : 0;
        const valorBTCAtual = totalBTC * precoBTC;
        const pnlUSD = valorBTCAtual - investidoTrades;
        const pnlPct = investidoTrades > 0 ? (pnlUSD / investidoTrades * 100) : 0;
        
        res.setHeader('Access-Control-Allow-Origin','*');
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({
          usdc, cbbtc,
          totalDepositado: totalDepositados,
          totalSacado: ts,
          totalTaxas: tx,
          valorTotal: valorTotal,
          valorContrato: valorContrato,
          valorWallet: valorWallet,
          precoBTC: precoBTC,
          // P&L metrics
          btcAcumulado: totalBTC,
          precoMedio: precoMedio,
          investidoTrades: investidoTrades,
          valorBTCAtual: valorBTCAtual,
          pnlUSD: pnlUSD,
          pnlPct: pnlPct,
          trades: tr,
          diasSemDCA: d,
          maxDiasSemComprar: 6,
          podeSacar: cbbtc > 1e-6
        }));
      }
      
      function fetchBinancePrice(res, usdc, cbbtc, w, d, tr, totalDepositados, ts, tx) {
        http.get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', {headers:{'User-Agent':'Mozilla/5.0'}}, (r) => {
          let body=''; r.on('data',c=>body+=c); r.on('end',()=>{
            let precoBTC = 0;
            try { precoBTC = parseFloat(JSON.parse(body).price) || 0; } catch {}
            sendResponse(res, usdc, cbbtc, precoBTC, w, d, tr, totalDepositados, ts, tx);
          });
        }).on('error',()=>sendResponse(res, usdc, cbbtc, 0, w, d, tr, totalDepositados, ts, tx));
      }
      
      // Try Coingecko first
      http.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', {headers:{'User-Agent':'Mozilla/5.0'}}, (r) => {
        let body=''; r.on('data',c=>body+=c); r.on('end',()=>{
          let precoBTC = 0;
          try { precoBTC = JSON.parse(body).bitcoin?.usd || 0; } catch {}
          if (precoBTC > 0) {
            sendResponse(res, usdc, cbbtc, precoBTC, w, d, tr, totalDepositados, ts, tx);
          } else {
            fetchBinancePrice(res, usdc, cbbtc, w, d, tr, totalDepositados, ts, tx);
          }
        });
      }).on('error',()=>fetchBinancePrice(res, usdc, cbbtc, w, d, tr, totalDepositados, ts, tx));
      
    }).catch(() => {
      res.setHeader('Access-Control-Allow-Origin','*');
      res.end(JSON.stringify({usdc:0,cbbtc:0,totalDepositado:99.97,totalSacado:0,totalTaxas:0,trades:[],diasSemDCA:0,maxDiasSemComprar:6,podeSacar:false}));
    });
    return;
  }  if (req.url === '/api/dca/history') {
    try {
      const w = JSON.parse(fs.readFileSync('/root/severino/ecosystem/data/wow-state.json','utf8'));
      const trades = (w.trades || []).filter(t => t.txHash && t.txHash !== '0xSIMULATED');
      const depositos = w.depositos || [];
      const saques = w.saques || [];
      res.setHeader('Access-Control-Allow-Origin','*');
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({trades,depositos,saques,totalTaxas:w.totalTaxas||0}));
    } catch(e) {
      res.setHeader('Access-Control-Allow-Origin','*');
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({trades:[],depositos:[],saques:[],totalTaxas:0}));
    }
    return;
  }
  if (req.url === '/api/jev/analysis') {
    const jevKey = fs.readFileSync('/root/severino/.env','utf8').match(/JEV_API_KEY=(.+)/)?.[1]?.trim();
    if (!jevKey) { res.writeHead(500); res.end(JSON.stringify({erro:'Sem JEV_KEY'})); return; }
    
    // Buscar dados de mercado via Promise
    var mercado = {};
    var prom = [
      new Promise(function(r2){
        https.get('https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=7', {headers:{'User-Agent':'Mozilla/5.0'}}, function(res2) {
          var d=''; res2.on('data',function(c){d+=c;}); res2.on('end',function(){try{r2(JSON.parse(d));}catch(e){r2(null);}});
        }).on('error',function(){r2(null);});
      }),
      new Promise(function(r2){
        https.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true', {headers:{'User-Agent':'Mozilla/5.0'}}, function(res2) {
          var d=''; res2.on('data',function(c){d+=c;}); res2.on('end',function(){try{r2(JSON.parse(d).bitcoin);}catch(e){r2(null);}});
        }).on('error',function(){r2(null);});
      })
    ];
    
    Promise.all(prom).then(function(results){
      var ohlc = results[0], btc = results[1];
      if(!btc||!ohlc||!Array.isArray(ohlc)||!btc.usd){
        res.writeHead(200); res.end(JSON.stringify({erro:'Sem dados',jev:{}})); return;
      }
      var prices = ohlc.map(function(c){return c[4];});
      // RSI
      var g=[],l=[],rs=[],i;
      for(i=1;i<prices.length;i++){var di=prices[i]-prices[i-1];g.push(di>0?di:0);l.push(di<0?-di:0);}
      var ag=g.slice(0,14).reduce(function(a,b){return a+b;},0)/14,il=l.slice(0,14).reduce(function(a,b){return a+b;},0)/14;
      for(i=14;i<g.length;i++){rs.push(il===0?100:100-100/(1+ag/il));ag=(ag*13+g[i])/14;il=(il*13+l[i])/14;}
      var rsi = rs.length ? rs[rs.length-1] : 50, preco = btc.usd, variacao = btc.usd_24h_change || 0;
      // BB
      var period=20,bbs=[],j;
      for(j=period-1;j<prices.length;j++){
        var s=prices.slice(j-period+1,j+1),m=s.reduce(function(a,b){return a+b;},0)/period,v=s.reduce(function(a,b){return a+(b-m)*(b-m);},0)/period,sd=Math.sqrt(v);
        bbs.push({upper:m+2*sd,middle:m,lower:m-2*sd});
      }
      var bb=bbs.length?bbs[bbs.length-1]:null,bbPos=bb?((preco-bb.lower)/(bb.upper-bb.lower)*100):50;
      
      var state = {btc_preco_usd:Math.round(preco),btc_variacao_24h_pct:variacao.toFixed(2),rsi_14:Math.round(rsi),bb_position_pct:Math.round(bbPos),macd_histogram:0,volume_relativo:'normal'};
      var body = JSON.stringify({model:'jev-latest',state,questions:{
        sinal:{type:'choice',instructions:'Sinal do mercado Bitcoin agora',criteria:{options:['PLANTAR','CULTIVAR','COLHER']}},
        risco:{type:'choice',instructions:'Nivel de risco',criteria:{options:['BAIXO','MEDIO','ALTO','EXTREMO']}},
        tendencia:{type:'choice',instructions:'Tendencia de curto prazo',criteria:{options:['ALTA','BAIXA','LATERAL']}},
        comprar:{type:'noul',instructions:'Momento de comprar BTC?'}
      }});
      
      var q = https.request('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+jevKey}},function(r2){
        var d=''; r2.on('data',function(c){d+=c;}); r2.on('end',function(){
          try{var j=JSON.parse(d).answers||{};res.setHeader('Access-Control-Allow-Origin','*');res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({btc:{preco,variacao,rsi,bbPos:Math.round(bbPos)},jev:{sinal:j.sinal&&j.sinal.choice||'?',risco:j.risco&&j.risco.choice||'?',tendencia:j.tendencia&&j.tendencia.choice||'?',comprar:Math.round((j.comprar&&j.comprar.noul||0)*100)},state}));}
          catch(e){res.writeHead(200);res.end(JSON.stringify({erro:e.message,jev:{}}));}
        });
      });
      q.write(body); q.end();
    }).catch(function(e){res.writeHead(500);res.end(JSON.stringify({erro:e.message}));});
    return;
  }
  res.writeHead(404); res.end();
});

const PORT = 3353;
server.listen(PORT, function(){console.log('dca-monitor on :'+PORT);});