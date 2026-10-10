const randomUUID = () => globalThis.crypto.randomUUID();

export const CHARACTERS = [
  { name: '夏宁', title: '谨慎的新手', color: '#9583de', bio: '认真盯盘，被偷袭时会慌一下，随后努力稳住。' },
  { name: '陆知遥', title: '冷静的分析派', color: '#5c86be', bio: '推一推眼镜，算清仓位再出手。' },
  { name: '林小满', title: '乐观的冲浪派', color: '#db977f', bio: '涨了就笑，跌了就炸毛，被冻住会喊出来。' },
  { name: '周屿', title: '从容的反制派', color: '#619c91', bio: '喜欢留一张豁免，等对手先出牌。' },
];
export const CARDS = {
  lift: { name: '拨动K线·拉升', icon: '↗', color: 'pink', target: 'stock', text: '对股票施加 +6% 推力，随后缓慢回落。所有持有者都会受到影响。' },
  drop: { name: '拨动K线·打压', icon: '↘', color: 'mint', target: 'stock', text: '对股票施加 −6% 压力，随后缓慢回落。也会影响自己的持仓。' },
  freeze: { name: '冻结资金', icon: '❄', color: 'blue', target: 'rival', allowSelf: true, text: '对自己立即冻结全部现金8秒；对对手2秒后冻结50%现金8秒。仍可卖出。' },
  illusion: { name: '虚假繁荣', icon: '✦', color: 'purple', target: 'rival', text: '2秒后让目标看到偏高的行情，持续8秒。交易按实际市价成交。' },
  buy: { name: '强制买入', icon: '⇢', color: 'pink', target: 'rival', text: '2秒后用目标50%的可用现金，按市场价买入你选中的股票。' },
  sell: { name: '强制卖出', icon: '⇠', color: 'mint', target: 'rival', text: '2秒后按市场价卖出目标所持选中股票的20%，至少1股。' },
  lock: { name: '锁仓契约', icon: '▣', color: 'blue', target: 'rival', text: '2秒后锁住目标选中股票50%的持仓，持续6秒。' },
  exempt: { name: '契约豁免', icon: '◇', color: 'purple', target: 'self', text: '抵挡一次攻击。可在预警里直接抵抗，或提前开启8秒护盾。' },
  cleanse: { name: '破妄解封', icon: '☼', color: 'mint', target: 'self', text: '立即清除自己的假行情、冻结和锁仓。' },
};
const CANDLE_MS = 10000;
const MARKET_MS = 1000;
const DRAFT_MS = 40000;
const pool = Object.keys(CARDS);
const uid = () => randomUUID();
const money = n => Math.round(n * 100) / 100;
export class Game {
  constructor(history, { seed = 12345, duration = 480000 } = {}) {
    this.history = history;
    this.seed = seed;
    this.duration = duration;
    this.state = 'lobby';
    this.players = [];
    this.stocks = history.map((s,i) => ({ name: s.name, source: s.symbol, price: s.candles[49].close, referencePrice: s.candles[49].close, pressure: 0, candles: s.candles.slice(0,50).map(c => ({...c})), index: i }));
    this.attacks = [];
    this.logs = [];
    this.now = 0;
    this.lastBar = -1; this.lastMarketStep = -1;
  }
  rand() { this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0; return this.seed / 4294967296; }
  log(text) { this.logs.unshift({ id: uid(), at: this.now, text }); this.logs.length = Math.min(this.logs.length,40); }
  card(type) { return { id: uid(), type }; }
  addPlayer(character = 0, bot = false) {
    if (this.state !== 'lobby') throw new Error('对局已经开始');
    if (this.players.length >= 4) throw new Error('房间已满');
    if (!Number.isInteger(character) || character < 0 || character > 3) throw new Error('请选择人物');
    if (this.players.some(p => p.character === character)) throw new Error('这个人物已被选择');
    const p = { id: uid(), character, bot, cash: 60000, holdings: [0,0,0], hand: [], draft: [], nextDraft: 0, frozen: 0, freezeAll: false, freezeUntil: 0, illusionUntil: 0, locks: [0,0,0], lockUntil: 0, shieldUntil: 0, queryUntil: 0, scan: null, reaction: { kind: 'neutral', text: '准备好了', until: 0 }, nextBot: 0 };
    this.players.push(p); return p;
  }
  start(now = Date.now(), fillBots = true) {
    if (this.state !== 'lobby') throw new Error('对局已经开始');
    if (fillBots) for (let c=0;c<4;c++) if (!this.players.some(p => p.character===c)) this.addPlayer(c,true);
    if (this.players.length < 2) throw new Error('至少两位玩家，或开启机器人补位');
    this.state = 'playing'; this.started = now; this.now = now; this.lastBar = -1; this.lastMarketStep = -1;
    for (const p of this.players) { p.hand = ['exempt','buy','lift'].map(t=>this.card(t)); this.draw(p); p.nextDraft = now+DRAFT_MS; p.nextBot = now+15000+this.rand()*10000; }
    this.log('开盘！每40秒三选一；先交易，再找机会出牌。');
  }
  draw(p) { const shuffled = [...pool]; for(let i=shuffled.length-1;i>0;i--) { const j=Math.floor(this.rand()*(i+1)); [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]; } p.draft = shuffled.slice(0,3).map(t=>this.card(t)); }
  react(p,kind,text) { p.reaction = { kind,text,until:this.now+3500 }; }
  value(p) { return money(p.cash+p.holdings.reduce((sum,n,i)=>sum+n*this.stocks[i].price,0)); }
  available(p) { if(p.freezeUntil>this.now&&p.freezeAll)return 0;return Math.max(0,p.cash-(p.freezeUntil>this.now?p.frozen:0)); }
  trade(p, stock, side, quantity, quote, forced = false) {
    if (!Number.isInteger(stock) || stock < 0 || stock > 2) throw new Error('股票无效');
    if (!['buy','sell'].includes(side) || !Number.isInteger(quantity) || quantity <= 0 || quantity > 1000000) throw new Error('请输入有效交易数量');
    const price = this.stocks[stock].price;
    if (side === 'buy') {
      const cost=money(price*quantity); if(cost > this.available(p)) throw new Error('可用现金不足，或部分资金被冻结');
      p.cash=money(p.cash-cost); p.holdings[stock]+=quantity;
    } else {
      const locked=p.lockUntil>this.now?p.locks[stock]:0;
      if(quantity>p.holdings[stock]-locked) throw new Error('可卖持仓不足，或部分持仓被锁定');
      p.cash=money(p.cash+money(price*quantity)); p.holdings[stock]-=quantity;
    }
    this.log(`${CHARACTERS[p.character].name}${forced?'被迫':''}${side==='buy'?'买入':'卖出'} ${this.stocks[stock].name} ${quantity}股`);
    this.react(p,forced?'panic':'happy',forced?'这笔交易不是我下的！':side==='buy'?'入场，盯紧走势。':'落袋，留点余地。');
  }
  action(id,a) {
    const p=this.players.find(p=>p.id===id); if(!p) throw new Error('玩家不存在');
    if(this.state!=='playing') throw new Error('当前不在交易时间');
    if(a.type==='trade') {
      let quantity=a.quantity;
      if(a.fraction!==undefined) {
        if(![.5,1].includes(a.fraction)||!Number.isInteger(a.stock)||a.stock<0||a.stock>2||!['buy','sell'].includes(a.side)) throw new Error('快捷交易参数无效');
        const capacity=a.side==='buy'?this.available(p)/this.stocks[a.stock].price:p.holdings[a.stock]-(p.lockUntil>this.now?p.locks[a.stock]:0);
        quantity=Math.min(1000000,Math.floor(capacity*a.fraction));
        if(quantity<1) throw new Error(a.side==='buy'?'可用现金不足以买入1股':'当前没有足够的可卖持仓');
      }
      return this.trade(p,a.stock,a.side,quantity,a.quote);
    }
    if(a.type==='pick') {
      const c=p.draft.find(c=>c.id===a.cardId); if(!c) throw new Error('这组选牌已经更新');
      if(p.hand.length>=6) throw new Error('手牌已满，先出牌腾出位置');
      p.hand.push(c); p.draft=[]; return;
    }
    if(a.type==='scan') {
      if(this.now<p.queryUntil) throw new Error('查账户还有冷却');
      const t=this.players.find(t=>t.id===a.target&&(t.id!==p.id||def.allowSelf)); if(!t) throw new Error('请选择对手');
      p.scan={ target:t.id, name:CHARACTERS[t.character].name, at:this.now, cash:t.cash, available:money(this.available(t)), holdings:[...t.holdings], value:this.value(t), handCount:t.hand.length, shield:t.shieldUntil>this.now, frozen:t.freezeUntil>this.now, locked:t.lockUntil>this.now }; p.queryUntil=this.now+3000; return;
    }
    if(a.type==='resist') {
      const attack=this.attacks.find(x=>x.id===a.attackId&&x.target===p.id&&x.due>this.now); if(!attack) throw new Error('这次攻击已经结算');
      const i=p.hand.findIndex(c=>c.type==='exempt'); if(i<0) throw new Error('没有契约豁免牌');
      p.hand.splice(i,1); this.attacks=this.attacks.filter(x=>x.id!==attack.id); this.react(p,'determined','契约豁免，这次不算。'); this.log(`${CHARACTERS[p.character].name}以契约豁免抵挡了${CARDS[attack.type].name}`); return;
    }
    if(a.type!=='play') throw new Error('未知操作');
    const i=p.hand.findIndex(c=>c.id===a.cardId); if(i<0) throw new Error('这张牌已不在手中');
    const type=p.hand[i].type, def=CARDS[type];
    const stock=a.stock;
    if(!Number.isInteger(stock)||stock<0||stock>2) throw new Error('请选择股票');
    let t;
    if(def.target==='rival') {
      t=this.players.find(t=>t.id===a.target&&(t.id!==p.id||def.allowSelf)); if(!t) throw new Error('请选择对手');
      if(['sell','lock'].includes(type)&&t.holdings[stock]<=0) throw new Error('目标没有这只股票，先查账户');
      if(type==='buy'&&this.available(t)<this.stocks[stock].price) throw new Error('目标可用现金不足');
    }
    p.hand.splice(i,1);
    if(type==='lift'||type==='drop') { this.stocks[stock].pressure=Math.max(-.12,Math.min(.12,this.stocks[stock].pressure+(type==='lift'?.06:-.06))); this.react(p,'determined',type==='lift'?'给行情一点推力。':'换个方向试试。'); this.log(`${CHARACTERS[p.character].name}对${this.stocks[stock].name}施放${def.name}`); }
    else if(type==='freeze'&&t.id===p.id) { p.frozen=p.cash;p.freezeAll=true;p.freezeUntil=this.now+8000;this.react(p,'determined','现金全冻住，强买别想扣。');this.log(`${CHARACTERS[p.character].name}立即冻结自己的全部现金，持续8秒`); }
    else if(type==='exempt') { p.shieldUntil=this.now+8000; this.react(p,'determined','豁免已备好。'); }
    else if(type==='cleanse') { p.illusionUntil=0; p.freezeUntil=0; p.lockUntil=0; this.react(p,'determined','看清了，解封。'); }
    else { this.attacks.push({ id:uid(), caster:p.id, target:t.id, type, stock, due:this.now+2000 }); this.react(p,'determined',`试试${def.name}。`); this.react(t,t.id===p.id?'determined':'panic',t.id===p.id?'先冻住现金，减少强买。':'有人对我出牌了？！'); this.log(`${CHARACTERS[p.character].name}向${CHARACTERS[t.character].name}施放${def.name}，2秒后生效`); }
  }
  resolve(a) {
    const t=this.players.find(p=>p.id===a.target); if(!t) return;
    if(a.caster!==a.target&&t.shieldUntil>this.now) { t.shieldUntil=0; this.react(t,'determined','护盾挡住了！'); this.log(`${CHARACTERS[t.character].name}的豁免护盾抵挡${CARDS[a.type].name}`); return; }
    if(a.type==='freeze') { t.frozen=t.cash*.5; t.freezeAll=false; t.freezeUntil=this.now+8000; this.react(t,'panic','我的钱冻住了？！'); }
    if(a.type==='illusion') { t.illusionUntil=this.now+8000; this.react(t,'happy','这走势，真的能追吗？'); }
    if(a.type==='lock') { if(t.lockUntil<=this.now) t.locks=[0,0,0]; t.locks[a.stock]=Math.ceil(t.holdings[a.stock]*.5); t.lockUntil=this.now+6000; this.react(t,'panic','卖不出去，先想办法！'); }
    if(a.type==='buy'||a.type==='sell') {
      const n=a.type==='buy'?Math.floor(this.available(t)*.5/this.stocks[a.stock].price):Math.min(Math.max(1,Math.floor(t.holdings[a.stock]*.2)),t.holdings[a.stock]-(t.lockUntil>this.now?t.locks[a.stock]:0));
      if(n>0) { try { this.trade(t,a.stock,a.type,n,null,true); } catch {} } else this.log(`${CARDS[a.type].name}未成交：目标已调整现金或持仓`);
    } else this.log(`${CHARACTERS[t.character].name}受到${CARDS[a.type].name}`);
  }
  tick(now=Date.now()) {
    if(this.state!=='playing') return; const dt=Math.max(0,(now-this.now)/1000); this.now=now;
    if(now>=this.started+this.duration) { this.state='ended'; this.attacks=[]; this.log('收盘。按现金与持仓市值结算。'); return; }
    const elapsed=now-this.started, marketStep=Math.floor(elapsed/MARKET_MS), marketElapsed=marketStep*MARKET_MS;
    const bar=Math.floor(marketElapsed/CANDLE_MS), frac=(marketElapsed%CANDLE_MS)/CANDLE_MS;
    for(const s of this.stocks) {
      s.pressure*=Math.exp(-dt/16);
      if(marketStep===this.lastMarketStep) continue;
      const candles=this.history[s.index].candles;
      const c=candles[Math.min(50+bar,candles.length-1)];
      const points=[c.open,c.low,c.high,c.close]; const part=Math.min(2,Math.floor(frac*3)), u=frac*3-part;
      const baseline=points[part]+(points[part+1]-points[part])*u;
      s.price=money(Math.max(1,baseline*(1+s.pressure)));
      if(bar!==this.lastBar) s.candles.push({open:s.price,high:s.price,low:s.price,close:s.price,volume:c.volume,time:bar});
      const last=s.candles.at(-1); last.high=Math.max(last.high,s.price); last.low=Math.min(last.low,s.price); last.close=s.price;
      if(s.candles.length>120) s.candles.shift();
    }
    this.lastBar=bar; this.lastMarketStep=marketStep;
    const due=this.attacks.filter(a=>a.due<=now); this.attacks=this.attacks.filter(a=>a.due>now); due.forEach(a=>this.resolve(a));
    for(const p of this.players) {
      if(now>=p.nextDraft) { this.draw(p); p.nextDraft=now+DRAFT_MS; }
      if(p.reaction.until<now) p.reaction={kind:'neutral',text:'盯盘中',until:0};
      if(!p.lastMoodAt||now-p.lastMoodAt>=5000) {
        const value=this.value(p), delta=value-(p.lastMoodValue??60000);
        if(p.reaction.kind==='neutral'&&Math.abs(delta)>600) {
          const happy=delta>0;
          const lines=happy?['有赚，别太贪。','走势符合预期。','涨了！稳住稳住！','先留一张反制。']:['跌了……还能稳住。','回撤，重新评估。','怎么又往下了？！','先减风险，别硬撑。'];
          this.react(p,happy?'happy':'panic',lines[p.character]);
        }
        p.lastMoodValue=value; p.lastMoodAt=now;
      }
      if(p.bot) this.bot(p);
    }
  }
  bot(p) {
    if(p.draft.length&&p.hand.length<6) { p.hand.push(p.draft[Math.floor(this.rand()*3)]); p.draft=[]; }
    const attack=this.attacks.find(a=>a.target===p.id);
    if(attack&&attack.due-this.now<1000&&p.hand.some(c=>c.type==='exempt')&&this.rand()<.4) { this.action(p.id,{type:'resist',attackId:attack.id}); }
    if(this.now<p.nextBot) return; p.nextBot=this.now+15000+this.rand()*10000;
    const stock=Math.floor(this.rand()*3), price=this.stocks[stock].price;
    try {
      const sell=p.holdings[stock]>0&&this.rand()<.4;
      const n=sell?Math.max(1,Math.floor(p.holdings[stock]*.3)):Math.floor(this.available(p)*.12/price);
      if(n>0) this.trade(p,stock,sell?'sell':'buy',n,price);
    } catch {}
    if(this.rand()<.7&&p.hand.length) {
      const c=p.hand[Math.floor(this.rand()*p.hand.length)], targets=this.players.filter(t=>t.id!==p.id), t=targets[Math.floor(this.rand()*targets.length)];
      try { this.action(p.id,{type:'play',cardId:c.id,stock,target:t.id}); } catch {}
    }
  }
  view(id) {
    const me=this.players.find(p=>p.id===id); if(!me) throw new Error('玩家不存在');
    const fake=me.illusionUntil>this.now;
    return { state:this.state, now:this.now, candleMs:CANDLE_MS, marketRefreshMs:MARKET_MS, remaining:Math.max(0,this.duration-(this.now-(this.started||this.now))), nextDraft:Math.max(0,me.nextDraft-this.now), characters:CHARACTERS, cardDefs:CARDS,
      stocks:this.stocks.map(s=>({ name:s.name, referencePrice:s.referencePrice, price:money(s.price*(fake?1.045:1)), actualPrice:s.price, pressure:s.pressure, candles:s.candles.map((c,i)=>fake&&i>=s.candles.length-12?{...c,open:c.open*1.045,close:c.close*1.045,high:c.high*1.045,low:c.low*1.045}:{...c} ) })),
      players:this.players.map(p=>({id:p.id,character:p.character,bot:p.bot,value:this.value(p),handCount:p.hand.length,reaction:p.reaction,frozen:p.freezeUntil>this.now,shield:p.shieldUntil>this.now,freezeRemaining:Math.max(0,p.freezeUntil-this.now)})),
      me:{id:me.id,character:me.character,cash:me.cash,available:money(this.available(me)),holdings:[...me.holdings],hand:me.hand,draft:me.draft,scan:me.scan,queryRemaining:Math.max(0,me.queryUntil-this.now),illusionRemaining:Math.max(0,me.illusionUntil-this.now),locks:me.lockUntil>this.now?me.locks:[0,0,0]},
      attacks:this.attacks.filter(a=>a.target===id||a.caster===id),logs:this.logs.slice(0,12) };
  }
}
