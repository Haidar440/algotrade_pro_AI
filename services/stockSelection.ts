import { AngelOne } from './angel';
import { FNO_UNIVERSE } from './fnoUniverse'; 

interface StockCandidate {
  symbol: string;
  bias: 'BULLISH' | 'BEARISH';
  score: number;
  reason: string;
}

export class StockSelector {
  
  // ⚙️ SETTINGS
  private static MIN_TURNOVER = 50000000; // ₹5 Cr
  private static MIN_PRICE = 50;
  private static ATR_MIN_PERCENT = 1.0;
  private static ATR_MAX_PERCENT = 6.0;

  // --- BATCH SCANNER ---
  public static async scanUniverse(angel: AngelOne, onProgress?: (msg: string) => void): Promise<StockCandidate[]> {
    const candidates: StockCandidate[] = [];
    const universe = FNO_UNIVERSE; 
    const total = universe.length;

    if (onProgress) onProgress(`🚀 Starting Scan on ${total} F&O Stocks...`);

    const BATCH_SIZE = 5;
    
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = universe.slice(i, i + BATCH_SIZE);
      
      if (onProgress) onProgress(`Scanning ${i + 1}-${Math.min(i + BATCH_SIZE, total)}...`);

      const results = await Promise.all(batch.map(async (rawSymbol) => {
         try {
             // 1. Get Token first (Validation)
             // We use 'rawSymbol' (e.g., TCS) NOT 'TCS-EQ' for lookup/history
             const token = await angel.searchSymbolToken(rawSymbol);
             
             if (!token) {
                // If simple lookup fails, TRY adding -EQ as backup
                // (Some indices or stocks might need it, but most F&O don't)
                const retryToken = await angel.searchSymbolToken(`${rawSymbol}-EQ`);
                if (!retryToken) {
                    return { passed: false, symbol: rawSymbol, reason: "Invalid Token" };
                }
             }

             // 2. Fetch Data using the RAW Symbol
             // The getHistoricalData function inside Angel class typically handles the token lookup
             // or accepts the symbol. We pass the raw name "TCS".
             const data = await angel.getHistoricalData(rawSymbol, "ONE_DAY", 250);
             
             if (!data || data.length < 200) {
                 return { passed: false, symbol: rawSymbol, reason: "Insufficient Data" };
             }
             
             // 3. Filter
             return this.runFilters(rawSymbol, data);
         } catch (e) { 
             return { passed: false, symbol: rawSymbol, reason: "API Error" }; 
         }
      }));

      // Collect winners
      results.forEach(res => {
         if (res.passed && res.candidate) {
            candidates.push(res.candidate);
            if (onProgress) onProgress(`⭐ FOUND: ${res.candidate.symbol} (${res.candidate.bias})`);
         }
      });

      await new Promise(r => setTimeout(r, 400)); 
    }

    if (onProgress) onProgress(`✅ Scan Complete. Found ${candidates.length} candidates.`);
    return candidates.sort((a, b) => b.score - a.score);
  }

  // --- FILTER LOGIC ---
  private static runFilters(symbol: string, data: any[]): { passed: boolean, candidate?: StockCandidate, reason?: string, symbol?: string } {
    const len = data.length;
    const curr = data[len - 1];
    const closes = data.map((c:any) => c.close);
    const volumes = data.map((c:any) => c.volume);
    const price = curr.close;

    // 1. Price Safety
    if (price < this.MIN_PRICE) return { passed: false, symbol, reason: "Penny Stock" };

    // 2. Liquidity Safety
    const avgVol = this.avg(volumes.slice(-20));
    const turnover = avgVol * price;
    if (turnover < this.MIN_TURNOVER) return { passed: false, symbol, reason: "Low Liquidity" };

    // 3. Trend Alignment
    const sma200 = this.avg(closes.slice(-200));
    const ema50 = this.calculateEMA(closes, 50);

    let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let score = 0;

    // BULLISH: Price > 200 SMA (Relaxed Rule)
    if (price > sma200) {
        bias = 'BULLISH';
        score += 50;
        if (price > ema50) score += 20; // Strong Trend
        if (curr.volume > avgVol * 1.5) score += 15; // Volume Spike
    } 
    
    if (bias === 'NEUTRAL') return { passed: false, symbol, reason: "Downtrend" };

    // 4. Volatility Check
    const atr = this.calculateATR(data, 14);
    const atrPct = (atr / price) * 100;
    
    // Slightly relaxed Volatility for large caps
    if (atrPct < 0.8) return { passed: false, symbol, reason: "Low Volatility" }; 
    if (atrPct > this.ATR_MAX_PERCENT) return { passed: false, symbol, reason: "High Risk" };

    return { 
        passed: true, 
        candidate: { symbol, bias, score, reason: `Trend+Liq` } 
    };
  }

  // --- MATH ---
  private static avg(arr: number[]) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
  private static calculateEMA(data: number[], period: number): number {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
    return ema;
  }
  private static calculateATR(data: any[], period: number): number {
    let trSum = 0;
    for (let i = 1; i < data.length; i++) {
        const h = data[i].high;
        const l = data[i].low;
        const pc = data[i-1].close;
        const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        if (i > data.length - period - 1) trSum += tr;
    }
    return trSum / period;
  }
}