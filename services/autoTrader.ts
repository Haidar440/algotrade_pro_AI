import { AngelOne } from './angel';
import { TechnicalAnalysisEngine } from './technicalAnalysis';
import { DB_SERVICE } from './db'; // ✅ Import DB Service

export interface AutoTraderConfig {
  capital: number;
  riskPerTrade: number;
  maxDailyLoss: number;
  targetMultiplier: number;
  enableTrailingSL: boolean;
  symbols: string[];
  maxOpenPositions: number; 
}

// ✅ UPDATED INTERFACE: Added 'dbId' to track MongoDB ID
interface ActiveTrade {
  symbol: string;
  entryPrice: number;
  quantity: number;
  stopLoss: number;
  target: number;
  entryOrderId: string;
  slOrderId?: string;
  highestPrice: number;
  status: 'OPEN' | 'EXITING' | 'CLOSED';
  pnl: number;
  dbId?: string; // <--- NEW: Stores the MongoDB ID so we can update it later
}

export class AutoTrader {
  private angel: AngelOne;
  private config: AutoTraderConfig;
  
  private isRunning: boolean = false;
  private activeTrades: Map<string, ActiveTrade> = new Map();
  private dailyLoss: number = 0;
  private tradeHistory: ActiveTrade[] = [];
  
  private lastAnalysisTime: Map<string, number> = new Map();
  private ANALYSIS_COOLDOWN = 300 * 1000; // 5 Minutes

  private onUpdate?: (status: any) => void;
  private onLog?: (msg: string) => void;

  constructor(
    angel: AngelOne, 
    config: AutoTraderConfig,
    onUpdate?: (status: any) => void,
    onLog?: (msg: string) => void
  ) {
    this.angel = angel;
    this.config = { ...config, maxOpenPositions: config.maxOpenPositions || 3 };
    this.onUpdate = onUpdate;
    this.onLog = onLog;
  }

  // --- CONTROL METHODS ---
  public start() {
    this.isRunning = true;
    this.log("🚀 Swing-Bot STARTED (Delivery Mode)");
    this.log(`🎯 Config: Max ${this.config.maxOpenPositions} Positions | Capital ₹${this.config.capital}`);
    this.broadcastStatus();
  }

  public stop() {
    this.isRunning = false;
    this.log("🛑 Swing-Bot STOPPED");
    this.broadcastStatus();
  }

  public updateConfig(newConfig: AutoTraderConfig) {
    this.config = { ...this.config, ...newConfig };
    this.log("⚙️ Config Updated");
    this.broadcastStatus();
  }

  // --- CORE LOOP ---
  public async processTick(symbol: string, ltp: number) {
    if (!this.isRunning) return;

    // 1. SAFETY: Daily Loss
    if (this.dailyLoss <= -this.config.maxDailyLoss) {
      this.log(`⛔ Max Loss Hit (₹${this.dailyLoss}). Stopping.`);
      this.stop();
      return;
    }

    // 2. MANAGE EXISTING
    if (this.activeTrades.has(symbol)) {
      await this.managePosition(symbol, ltp);
      return;
    }

    // 3. CHECK LIMITS
    if (this.activeTrades.size >= this.config.maxOpenPositions) return; 

    // 4. SCAN FOR ENTRY
    if (this.config.symbols.includes(symbol)) {
       const lastRun = this.lastAnalysisTime.get(symbol) || 0;
       const now = Date.now();
       
       if (now - lastRun > this.ANALYSIS_COOLDOWN) {
          this.lastAnalysisTime.set(symbol, now);
          this.log(`🔍 Scanning ${symbol}...`); 
          
          try {
             const history = await this.angel.getHistoricalData(symbol.replace('.NS', ''), "ONE_DAY", 100);
             if (history && history.length > 50) {
                 await this.evaluateEntry(symbol, ltp, history);
             }
          } catch(e) {}
       }
    }
  }

  // --- ENTRY LOGIC ---
  private async evaluateEntry(symbol: string, ltp: number, candles: any[]) {
    try {
      const analysis = TechnicalAnalysisEngine.analyze(symbol, candles);
      const rec = analysis.primary_recommendation;

      if (rec.signal !== 'STRONG BUY' && rec.signal !== 'BUY') return;
      if (rec.confidence < 0.80) return;

      const sl = rec.stop_loss;
      if (!sl || sl >= ltp) return; 

      const riskPerShare = ltp - sl;
      const riskAmount = this.config.capital * (this.config.riskPerTrade / 100);
      let quantity = Math.floor(riskAmount / riskPerShare);

      const maxQty = Math.floor((this.config.capital * 0.25) / ltp);
      quantity = Math.min(quantity, maxQty);

      if (quantity < 1) return;

      this.log(`⚡ Swing Signal: ${symbol} @ ${ltp}. Buy ${quantity} Qty`);
      await this.executeEntry(symbol, ltp, sl, quantity, rec.strategy_name);

    } catch (e) { console.error(e); }
  }

  // --- EXECUTION ---
  private async executeEntry(symbol: string, price: number, sl: number, qty: number, strategy: string) {
    try {
      const token = await this.angel.searchSymbolToken(symbol);
      
      // 1. PLACE ORDER FIRST
      const entryRes = await this.angel.placeOrder({
        variety: 'NORMAL',
        tradingsymbol: `${symbol}-EQ`,
        symboltoken: token,
        transactiontype: 'BUY',
        exchange: 'NSE',
        ordertype: 'MARKET',
        producttype: 'DELIVERY',
        duration: 'DAY',
        price: '0',
        quantity: qty.toString()
      });

      if (entryRes.status && entryRes.orderid) {
        this.log(`✅ BUY Success: ${symbol}`);

        // 2. SAVE TO MONGODB (Capture the ID)
        let dbId = undefined;
        try {
            const dbTrade = {
                symbol: symbol,
                entryPrice: price,
                quantity: qty,
                type: 'SWING',
                status: 'OPEN',
                strategy: strategy,
                entryDate: new Date(),
                notes: `Bot Entry | Target: ${(price * 1.1).toFixed(1)}`
            };
            const savedTrade = await DB_SERVICE.saveTrade(dbTrade);
            if(savedTrade) {
                dbId = savedTrade._id; // ✅ Save the ID!
                this.log(`💾 Trade Saved to DB (ID: ${dbId})`);
            }
        } catch(e) { this.log("⚠️ DB Save Failed"); }

        // 3. STOP LOSS ORDER
        const slRes = await this.angel.placeOrder({
          variety: 'STOPLOSS',
          tradingsymbol: `${symbol}-EQ`,
          symboltoken: token,
          transactiontype: 'SELL',
          exchange: 'NSE',
          ordertype: 'STOPLOSS_LIMIT',
          producttype: 'DELIVERY',
          duration: 'DAY',
          price: (sl - 0.5).toString(),
          triggerprice: sl.toString(),
          quantity: qty.toString()
        });

        const slOrderId = slRes.status ? slRes.orderid : undefined;
        if(slOrderId) this.log(`🛡️ Stop Loss Placed: ${symbol} @ ${sl}`);

        // 4. ADD TO MEMORY
        const target = price + (price - sl) * this.config.targetMultiplier;
        const newTrade: ActiveTrade = {
          symbol,
          entryPrice: price,
          quantity: qty,
          stopLoss: sl,
          target: target,
          entryOrderId: entryRes.orderid!,
          slOrderId: slOrderId,
          highestPrice: price,
          status: 'OPEN',
          pnl: 0,
          dbId: dbId // ✅ Store DB ID here
        };

        this.activeTrades.set(symbol, newTrade);
        this.broadcastStatus();
      }
    } catch (e: any) { this.log(`❌ Execution Error: ${e.message}`); }
  }

  // --- MANAGEMENT ---
  private async managePosition(symbol: string, ltp: number) {
    const trade = this.activeTrades.get(symbol);
    if (!trade || trade.status !== 'OPEN') return;

    trade.pnl = (ltp - trade.entryPrice) * trade.quantity;
    
    // Trailing SL
    if (this.config.enableTrailingSL) {
       if (ltp > trade.highestPrice) {
         trade.highestPrice = ltp;
         await this.checkTrailingSL(trade, ltp);
       }
    }

    // Exit Conditions
    if (ltp >= trade.target) {
      this.log(`🎯 Target Hit: ${symbol} @ ${ltp}`);
      await this.exitPosition(trade, "TARGET");
    } else if (ltp <= trade.stopLoss) {
        this.log(`🛑 SL Triggered: ${symbol}`);
        await this.exitPosition(trade, "SL HIT");
    }
    
    this.broadcastStatus();
  }

  private async checkTrailingSL(trade: ActiveTrade, ltp: number) {
    if (!trade.slOrderId) return;
    
    const initialRisk = trade.entryPrice - trade.stopLoss;
    const newStopLoss = trade.highestPrice - initialRisk; 
    const threshold = trade.entryPrice * 0.02; 

    if (newStopLoss > (trade.stopLoss + threshold)) {
       this.log(`🔄 Trailing SL: ${trade.symbol} -> ${newStopLoss.toFixed(2)}`);
       
       const res = await this.angel.modifyOrder({
         variety: 'STOPLOSS',
         orderid: trade.slOrderId,
         ordertype: 'STOPLOSS_LIMIT',
         producttype: 'DELIVERY',
         duration: 'DAY',
         price: (newStopLoss - 0.5).toFixed(1),
         triggerprice: newStopLoss.toFixed(1),
         quantity: trade.quantity.toString(),
         tradingsymbol: `${trade.symbol}-EQ`,
         symboltoken: await this.angel.searchSymbolToken(trade.symbol),
         exchange: 'NSE'
       });

       if (res.status) trade.stopLoss = newStopLoss;
    }
  }

  // --- EXIT LOGIC (NOW UPDATES DB!) ---
  private async exitPosition(trade: ActiveTrade, reason: string) {
    trade.status = 'EXITING';
    try {
      const token = await this.angel.searchSymbolToken(trade.symbol);
      if (trade.slOrderId) await this.angel.cancelOrder(trade.slOrderId, 'STOPLOSS');

      await this.angel.placeOrder({
        variety: 'NORMAL',
        tradingsymbol: `${trade.symbol}-EQ`,
        symboltoken: token,
        transactiontype: 'SELL',
        exchange: 'NSE',
        ordertype: 'MARKET',
        producttype: 'DELIVERY',
        duration: 'DAY',
        price: '0',
        quantity: trade.quantity.toString()
      });

      this.log(`🔒 Closed (${reason}) PnL: ₹${trade.pnl.toFixed(2)}`);

      // ✅ UPDATE MONGODB
      if (trade.dbId) {
          try {
            await DB_SERVICE.updateTrade(trade.dbId, {
                status: 'CLOSED',
                exitDate: new Date(),
                exitPrice: trade.entryPrice + (trade.pnl / trade.quantity), // Approximate exit price
                pnl: trade.pnl,
                notes: `Closed by Bot: ${reason}`
            });
            this.log(`💾 DB Updated: Trade Closed`);
          } catch(e) { this.log("⚠️ Failed to update DB on exit"); }
      }

      this.dailyLoss += trade.pnl;
      this.activeTrades.delete(trade.symbol);
      this.tradeHistory.push({ ...trade, status: 'CLOSED' });
      this.broadcastStatus();

    } catch (e: any) {
      this.log(`❌ Exit Failed: ${e.message}`);
      trade.status = 'OPEN';
    }
  }

  private log(msg: string) {
    const time = new Date().toLocaleTimeString();
    console.log(`[AutoTrader ${time}] ${msg}`);
    if (this.onLog) this.onLog(`[${time}] ${msg}`);
  }

  private broadcastStatus() {
    if (this.onUpdate) {
        this.onUpdate({
            isRunning: this.isRunning,
            activeTrades: Array.from(this.activeTrades.values()),
            dailyPnL: this.dailyLoss, 
            history: this.tradeHistory
        });
    }
  }
}