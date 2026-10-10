const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

var DATA_DIR = '/root/severino/ecosystem/data';
var STATE_PATH = path.join(DATA_DIR, 'auto-dca-state.json');
var VAULT = '0x17CcB86BcAd08dB4BBB13827b609e8bd632F89b5'.toLowerCase();
var USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase();
var CBTC = '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf'.toLowerCase();
var RPC = 'https://mainnet.base.org';
var BINANCE_4H = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=20';
var JEV_URL = 'http://localhost:3353/api/jev/analysis';
var COINGECKO = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';

function env(k, fb) {
  try { var m = fs.readFileSync('/root/severino/.env','utf8').match(new RegExp(k+'=(.+)')); return m ? m[1].trim() : fb; } catch { return fb; }
}
var WOW_KEY = env('WOW_WALLET_KEY','');
var TG_TOKEN = env('TELEGRAM_COMMUNITY_TOKEN',env('TELEGRAM_TOKEN',''));
var TG_CHAT = env('TELEGRAM_CANAL_ID',env('TELEGRAM_CHAT_ID',''));

function httpJSON(url) {
  return new Promise(function(s,f) {
    var p = url.startsWith('https') ? https : http;
    p.get(url, {headers:{'User-Agent':'AutoDCA/1.0'}}, function(r) {
      var d=''; r.on('data',function(c){d+=c;}); r.on('end',function(){try{s(JSON.parse(d));}catch(e){f(e);}});
    }).on('error',f).setTimeout(15000);
  });
}

function telegram(text) {
  if (!TG_TOKEN||!TG_CHAT) return;
  var b = JSON.stringify({chat_id:TG_CHAT,text,parse_mode:'HTML',disable_web_page_preview:true});
  var o = {hostname:'api.telegram.org',path:'/bot'+TG_TOKEN+'/sendMessage',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}};
  var r = https.request(o,function(){}); r.write(b); r.end();
}

function rpcCall(to, data) {
  return new Promise(function(s,f) {
    var b = JSON.stringify({jsonrpc:'2.0',method:'eth_call',params:[{to,data},'latest'],id:1});
    var o = {hostname:'mainnet.base.org',path:'/',method:'POST',headers:{'Content-Type':'application/json'}};
    var r = https.request(o,function(r2){var d='';r2.on('data',function(c){d+=c;});r2.on('end',function(){try{s(JSON.parse(d));}catch(e){f(e);}});});
    r.write(b); r.end(); r.setTimeout(10000,function(){r.destroy();f(new Error('timeout'));});
  });
}

function balOf(addr) { return '0x70a08231'+'000000000000000000000000'+addr.slice(2).toLowerCase(); }
function ts() { var d=new Date(); return d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',hour12:false}).replace(',',''); }

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH,'utf8')); } catch {
    return {buys:[],totalInvestido:0,totalBTC:0,precoMedio:0,avisoDia:'',lastCandleTs:0};
  }
}
function saveState(s) { try{fs.mkdirSync(DATA_DIR,{recursive:true});}catch{} fs.writeFileSync(STATE_PATH,JSON.stringify(s,null,2)); }

function calcularRSI(prices, period) {
  period=period||14; if(prices.length<period+1)return[];
  var g=[],l=[]; for(var i=1;i<prices.length;i++){var d=prices[i]-prices[i-1];g.push(d>0?d:0);l.push(d<0?-d:0);}
  var ag=g.slice(0,period).reduce(function(a,b){return a+b;},0)/period;
  var al=l.slice(0,period).reduce(function(a,b){return a+b;},0)/period;
  var rs=[]; for(var i=period;i<g.length;i++){rs.push(al===0?100:100-100/(1+ag/al));ag=(ag*(period-1)+g[i])/period;al=(al*(period-1)+l[i])/period;}
  return rs;
}

async function getBTCPrice() {
  try { var j=await httpJSON(COINGECKO); if(j&&j.bitcoin&&j.bitcoin.usd)return j.bitcoin.usd; }catch{}
  try { var j=await httpJSON(BINANCE_4H); if(Array.isArray(j)&&j.length)return parseFloat(j[j.length-1][4]); }catch{}
  return 0;
}

async function getVaultBalances() {
  try {
    var r1=await rpcCall(USDC,balOf(VAULT)); var r2=await rpcCall(CBTC,balOf(VAULT));
    return {usdc:(r1&&r1.result&&r1.result!=='0x'?parseInt(r1.result,16)/1e6:0),cbbtc:(r2&&r2.result&&r2.result!=='0x'?parseInt(r2.result,16)/1e8:0)};
  } catch{return{usdc:0,cbbtc:0};}
}

async function depositarVaultViaAPI(amountUSD) {
  try {
    var http = require('http');
    var https = require('https');
    var postData = JSON.stringify({});
    var options = {
      hostname: 'traderdca.severinobot.com',
      port: 3339,
      path: '/api/st/deposit/' + amountUSD,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      rejectUnauthorized: false
    };
    return new Promise(function(resolve, reject) {
      var req = https.request(options, function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          try {
            var result = JSON.parse(data);
            resolve(result);
          } catch(e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  } catch(e) { return Promise.resolve({ok:false,erro:e.message}); }
}

async function checkAndBuy() {
  var state=loadState();
  var bals=await getVaultBalances();
  if(bals.cbbtc>0)state.totalBTC=bals.cbbtc;

  if(bals.cbbtc>0){
    var precoBTC=await getBTCPrice();
    if(precoBTC>0){
      var btcValue=bals.cbbtc*precoBTC;
      if(btcValue>=100){
        console.log('[AUTO-DCA] Meta $100! Sacando...');
        try{
          var {ethers}=require('/root/severino/ecosystem/node_modules/ethers');
          var p=new ethers.JsonRpcProvider(RPC); var w=new ethers.Wallet(WOW_KEY,p);
          var c=new ethers.Contract(VAULT,['function withdraw() external'],w);
          var tx=await c.withdraw({gasLimit:300000}); await tx.wait();
          state.buys=[]; state.totalInvestido=0; state.totalBTC=0; saveState(state);
          telegram('<b>META DE $100 ATINGIDA!</b>\n\ncbBTC sacado!\n<a href="https://basescan.org/tx/'+tx.hash+'">TX</a>');
        }catch(ew){telegram('Erro ao sacar: '+ew.message);}
        return;
      }
    }
  }

  // Fetch 4h candles
  var candles; try{candles=await httpJSON(BINANCE_4H);}catch{return;}
  if(!Array.isArray(candles)||candles.length<3)return;

  // Fetch JEV analysis
  var jevData; try{jevData=await httpJSON(JEV_URL);}catch{return;}
  if(!jevData||!jevData.jev)return;
  var jev=jevData.jev;
  var sinal=jev.sinal||'';
  var risco=jev.risco||'';
  var tendencia=jev.tendencia||'';
  var comprarPct=jev.comprar||0;

  // Get last CLOSED 4h candle (penultimate)
  var last=candles[candles.length-2]; if(!last)return;
  var lastTs=parseInt(last[0]);
  var isRed=parseFloat(last[4])<parseFloat(last[1]);
  if(lastTs<=(state.lastCandleTs||0))return;

  // Condition: red candle AND JEV says PLANTAR (best entry)
  if(!isRed||sinal!=='PLANTAR')return;

  state.lastCandleTs=lastTs; saveState(state);
  console.log('[AUTO-DCA] Vela 4h VERMELHA + JEV '+sinal+' ('+comprarPct+'%)');

  // === BUY LOGIC ===
  if(bals.usdc>=5){
    var precoBTC=await getBTCPrice(); if(!precoBTC)return;
    try{
      var {ethers}=require('/root/severino/ecosystem/node_modules/ethers');
      var p=new ethers.JsonRpcProvider(RPC); var w=new ethers.Wallet(WOW_KEY,p);
      var vC=new ethers.Contract(VAULT,['function executeDCA(uint256,uint160) external','function withdraw() external'],w);
      var amountSwap=Math.min(bals.usdc,10);
      var minOut=ethers.parseUnits(((amountSwap/precoBTC)*0.99).toFixed(8),8);
      console.log('[AUTO-DCA] Swap $'+amountSwap.toFixed(2)+' USDC -> cbBTC...');
      var tx=await vC.executeDCA(minOut,0,{gasLimit:500000}); await tx.wait();
      await new Promise(r=>setTimeout(r,5000));
      var nb=await getVaultBalances();
      state.buys.push({data:new Date().toISOString().slice(0,10),hora:new Date().toISOString().slice(11,16),valor:amountSwap,precoBTC:precoBTC,jev:sinal,txHash:tx.hash,cbbtcObtido:nb.cbbtc});
      state.totalInvestido=(state.totalInvestido||0)+amountSwap; state.totalBTC=nb.cbbtc; saveState(state);
      var btcValue=nb.cbbtc*precoBTC;
      var msg='<b>DCA AUTOMATICO</b>\nUSDC trocado: <b>$'+amountSwap.toFixed(2)+'</b>\nBTC @ $'+precoBTC.toLocaleString()+'\nJEV: '+sinal+' ('+comprarPct+'%)\ncbBTC: '+nb.cbbtc.toFixed(8)+'\nValor: $'+btcValue.toFixed(2)+'\n\n<a href="https://basescan.org/tx/'+tx.hash+'">TX</a>\nTotal investido: $'+(state.totalInvestido||0).toFixed(2)+'\nFaltam $'+(100-btcValue).toFixed(2)+' p/ meta $100.';
      telegram(msg); console.log('[AUTO-DCA] OK. cbBTC: '+nb.cbbtc.toFixed(8));
      if(btcValue>=100){
        try{var wTx=await vC.withdraw({gasLimit:300000});await wTx.wait();state.buys=[];state.totalInvestido=0;state.totalBTC=0;saveState(state);telegram('<b>META DE $100 ATINGIDA!</b>\n\ncbBTC sacado!\n<a href="https://basescan.org/tx/'+wTx.hash+'">TX</a>');}catch(ew){telegram('Erro ao sacar: '+ew.message);}
      }
    }catch(e){console.log('[AUTO-DCA] Erro: '+e.message);}
  }else{
    console.log('[AUTO-DCA] Vault sem USDC. Depositando via API...');
    var r=await depositarVaultViaAPI(10);
    if(r.ok){
      console.log('[AUTO-DCA] Depositado $10 via API. Chamando executeDCA...');
      var precoBTC=await getBTCPrice(); if(!precoBTC)return;
      try{
        var {ethers}=require('/root/severino/ecosystem/node_modules/ethers');
        var p=new ethers.JsonRpcProvider(RPC); var w=new ethers.Wallet(WOW_KEY,p);
        var vC=new ethers.Contract(VAULT,['function executeDCA(uint256,uint160) external','function withdraw() external'],w);
        var minOut=ethers.parseUnits(((10/precoBTC)*0.99).toFixed(8),8);
        var tx=await vC.executeDCA(minOut,0,{gasLimit:500000}); await tx.wait();
        await new Promise(r=>setTimeout(r,5000));
        var nb=await getVaultBalances();
        state.buys.push({data:new Date().toISOString().slice(0,10),hora:new Date().toISOString().slice(11,16),valor:10,precoBTC:precoBTC,jev:sinal,txHash:tx.hash,cbbtcObtido:nb.cbbtc});
        state.totalInvestido=(state.totalInvestido||0)+10; state.totalBTC=nb.cbbtc; saveState(state);
        var btcValue=nb.cbbtc*precoBTC;
        var msg='<b>DCA AUTO (JEV)</b>\n$10 hot wallet -> vault -> swap\nBTC @ $'+precoBTC.toLocaleString()+'\nJEV: '+sinal+' ('+comprarPct+'%)\ncbBTC: '+nb.cbbtc.toFixed(8)+'\nValor: $'+btcValue.toFixed(2)+'\n<a href="https://basescan.org/tx/'+tx.hash+'">TX</a>\nFaltam $'+(100-btcValue).toFixed(2)+' p/ $100.';
        telegram(msg);
      }catch(e){console.log('[AUTO-DCA] Erro swap: '+e.message);}
    }else{
      var hoje=new Date().toISOString().slice(0,10);
      if(state.avisoDia!==hoje){state.avisoDia=hoje;saveState(state);telegram('<b>DCA AUTO: Saldo esgotado!</b>\n\nHot wallet: '+r.erro+'\n\nDeposite USDC na hot wallet (0xf7326...) e o bot usa $10 por vela 4h vermelha com JEV PLANTAR.');}
    }
  }
}

var PORT=3354;
var server=http.createServer(function(req,res){
  var u=req.url.split('?')[0];
  if(u==='/api/auto-dca/status'){
    var s=loadState(); Promise.all([getVaultBalances(),getBTCPrice()]).then(function(r2){
      var b=r2[0],p=r2[1]; var v=b.cbbtc*p; var buys=s.buys||[];
      res.setHeader('Access-Control-Allow-Origin','*'); res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({vaultUsdc:b.usdc,vaultCbbtc:b.cbbtc,precoBTC:p,valorCbbtc:v,metaFaltando:v<100?(100-v).toFixed(2):0,podeSacar:v>=100,estado:{totalInvestido:s.totalInvestido||0,totalBTC:s.totalBTC||0,precoMedio:s.precoMedio||0,numCompras:buys.length,ultimaCompra:buys.length>0?buys[buys.length-1]:null,swapsTotal:buys.reduce(function(a,b){return a+(b.valor||0);},0)}}));
    }); return;
  }
  if(u==='/api/auto-dca/depositar'&&req.method==='POST'){
    var bd=''; req.on('data',function(c){bd+=c.toString();}); req.on('end',function(){
      try{var d=JSON.parse(bd||'{}');var amt=Math.max(5,Number(d.valor)||10);depositarVaultViaAPI(amt).then(function(r){res.setHeader('Access-Control-Allow-Origin','*');res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(r));});}catch(e){res.writeHead(500);res.end(JSON.stringify({ok:false,erro:e.message}));}
    }); return;
  }
  res.writeHead(404); res.end();
});
server.listen(PORT,function(){console.log('[AUTO-DCA] Server on :'+PORT);});

async function mainLoop(){console.log('[AUTO-DCA] '+ts());await checkAndBuy();}
mainLoop().catch(function(e){console.log('[AUTO-DCA] Erro: '+e.message);});
setInterval(function(){mainLoop().catch(function(e){console.log('[AUTO-DCA] Erro: '+e.message);});},5*60*1000);