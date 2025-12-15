
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PaperTrade, BrokerState } from '../types';
import { streamer } from '../services/streaming';
import { AngelOne } from '../services/angel';
import { 
  Trash2, Clock, CheckCircle2, Target, PieChart, 
  ArrowUpRight, ArrowDownRight, Activity, TrendingUp, Loader2, Zap
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PaperTradingDashboardProps {
  trades: PaperTrade[];
  onCloseTrade: (id: string, exitPrice: number) => void;
  onDeleteTrade: (id: string) => void;
  brokerState: BrokerState;
}

const PaperTradingDashboard: React.FC<PaperTradingDashboardProps> = ({ trades, onCloseTrade, onDeleteTrade, brokerState }) => {
  const [exitPriceInputs, setExitPriceInputs] = useState<{ [key: string]: string }>({});
  const [livePrices, setLivePrices] = useState<{ [key: string]: number }>({});
  const [closingTradeId, setClosingTradeId] = useState<string | null>(null);

  const activeTrades = trades.filter(t => t.status === 'OPEN');
  const closedTrades = trades.filter(t => t.status === 'CLOSED');

  // --- Real-time Streaming Integration ---
  useEffect(() => {
    // Identify unique symbols in active trades
    const symbols = Array.from(new Set(activeTrades.map(t => t.symbol)));
    
    // Map to store cleanup functions (unsubscribe)
    const unsubs: Array<() => void> = [];

    symbols.forEach(symbol => {
        // Callback for this specific symbol
        const handlePriceUpdate = (price: number) => {
            setLivePrices(prev => ({ ...prev, [symbol]: price }));
        };

        // Find a reference entry price to seed the streamer if it's new
        const trade = activeTrades.find(t => t.symbol === symbol);
        const seedPrice = trade?.entryPrice || 100;

        // Subscribe
        streamer.subscribe(symbol, seedPrice, handlePriceUpdate);

        // Store unsubscribe logic
        unsubs.push(() => streamer.unsubscribe(symbol, handlePriceUpdate));
    });

    // Cleanup on unmount or activeTrades change
    return () => {
        unsubs.forEach(unsub => unsub());
    };
  }, [activeTrades.length, activeTrades.map(t => t.symbol).join(',')]);


  // --- Derived Metrics ---
  const totalRealizedPnL = closedTrades.reduce((acc, curr) => acc + (curr.pnl || 0), 0);
  
  const totalUnrealizedPnL = activeTrades.reduce((acc, t) => {
    const current = livePrices[t.symbol] || streamer.getLastPrice(t.symbol) || t.entryPrice;
    return acc + ((current - t.entryPrice) * t.quantity);
  }, 0);

  const totalPnL = totalRealizedPnL + totalUnrealizedPnL;
  const winCount = closedTrades.filter(t => (t.pnl || 0) > 0).length;
  const winRate = closedTrades.length > 0 ? Math.round((winCount / closedTrades.length) * 100) : 0;
  
  const bestTrade = closedTrades.reduce((max, t) => (t.pnl || 0) > max ? (t.pnl || 0) : max, 0);
  const worstTrade = closedTrades.reduce((min, t) => (t.pnl || 0) < min ? (t.pnl || 0) : min, 0);

  // --- Equity Curve Data ---
  const equityData = useMemo(() => {
    let balance = 100000; // Starting fictitious capital
    const data = [{ name: 'Start', value: balance }];
    
    // Sort closed trades by date
    const sorted = [...closedTrades].sort((a,b) => new Date(a.exitDate!).getTime() - new Date(b.exitDate!).getTime());
    
    sorted.forEach((t, idx) => {
        balance += (t.pnl || 0);
        data.push({
            name: `${idx + 1}`, // Trade Number
            value: balance
        });
    });
    
    // Add current live floating PnL as the last point
    if (activeTrades.length > 0) {
        data.push({ name: 'Now', value: balance + totalUnrealizedPnL });
    }

    return data;
  }, [closedTrades, totalUnrealizedPnL]);


  const handleExitPriceChange = (id: string, val: string) => {
    setExitPriceInputs(prev => ({ ...prev, [id]: val }));
  };

  const handleCloseClick = async (trade: PaperTrade) => {
    setClosingTradeId(trade.id);
    let finalPrice = livePrices[trade.symbol] || trade.entryPrice;
    
    // Check if Angel One is connected for REAL price
    if (brokerState.angel) {
      try {
        const angel = new AngelOne(brokerState.angel);
        const ltp = await angel.getLtp(trade.symbol);
        if (ltp && ltp > 0) {
           finalPrice = ltp;
           console.log(`Angel One LTP for ${trade.symbol}: ${ltp}`);
        }
      } catch (e) {
        console.warn("Failed to fetch Angel One LTP, using stream price.", e);
      }
    } else {
        // Use manual input if available, otherwise stream price
        const priceStr = exitPriceInputs[trade.id];
        if (priceStr) {
            const p = parseFloat(priceStr);
            if (!isNaN(p) && p > 0) finalPrice = p;
        }
    }

    onCloseTrade(trade.id, finalPrice);
    setClosingTradeId(null);
    setExitPriceInputs(prev => {
        const copy = { ...prev };
        delete copy[trade.id];
        return copy;
    });
  };

  const getProgress = (current: number, entry: number, target: number) => {
    if (target === entry) return 0;
    const progress = ((current - entry) / (target - entry)) * 100;
    return Math.max(0, Math.min(100, progress));
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
           <PieChart className="text-emerald-400" /> Portfolio Dashboard
        </h1>
        <div className="flex gap-2">
           {brokerState.angel && (
              <div className="flex items-center gap-2 text-xs font-mono bg-blue-900/40 px-3 py-1 rounded-full border border-blue-700/50">
                <Zap className="w-3 h-3 text-blue-400 fill-current" />
                <span className="text-blue-200 font-bold">ANGEL API READY</span>
              </div>
           )}
           <div className="flex items-center gap-2 text-xs font-mono bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
             <span className="relative flex h-2 w-2">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
               <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
             </span>
             <span className="text-emerald-400 font-bold">LIVE FEED ACTIVE</span>
           </div>
        </div>
      </div>

      {/* 1. Portfolio Summary & Equity Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stats Grid */}
        <div className="lg:col-span-1 grid grid-cols-2 gap-4">
            <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/50 flex flex-col justify-center">
                <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Net P&L</div>
                <div className={`text-2xl font-mono font-bold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toFixed(0)}
                </div>
            </div>
            
            <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/50 flex flex-col justify-center">
                <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Win Rate</div>
                <div className="text-2xl font-mono font-bold text-amber-400">{winRate}%</div>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/50 flex flex-col justify-center">
                <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Best Trade</div>
                <div className="text-lg font-mono font-bold text-emerald-400">+₹{bestTrade.toFixed(0)}</div>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/50 flex flex-col justify-center">
                <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Worst Trade</div>
                <div className="text-lg font-mono font-bold text-rose-400">₹{worstTrade.toFixed(0)}</div>
            </div>
        </div>

        {/* Equity Chart */}
        <div className="lg:col-span-2 glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/30">
             <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Account Growth Curve</h3>
             </div>
             <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={equityData}>
                      <defs>
                        <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="name" hide />
                      <YAxis domain={['auto', 'auto']} hide />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                        itemStyle={{ color: '#10b981' }}
                        formatter={(val: number) => [`₹${val.toFixed(0)}`, 'Equity']}
                      />
                      <Area type="monotone" dataKey="value" stroke="#10b981" fillOpacity={1} fill="url(#colorEquity)" strokeWidth={2} />
                   </AreaChart>
                </ResponsiveContainer>
             </div>
        </div>
      </div>

      {/* 2. Active Positions */}
      <div className="glass-panel rounded-xl overflow-hidden border border-slate-700">
        <div className="p-4 bg-slate-800/50 border-b border-slate-700 flex justify-between items-center">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" /> Active Positions
            <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded-full">{activeTrades.length}</span>
          </h3>
        </div>
        
        {activeTrades.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
             <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <Target className="w-8 h-8 text-slate-600" />
             </div>
             <p className="text-slate-400 font-medium">No active positions.</p>
             <p className="text-slate-500 text-sm">Use the Scanner to find and execute new trades.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {activeTrades.map(trade => {
              const currentPrice = livePrices[trade.symbol] || trade.entryPrice;
              const pnl = (currentPrice - trade.entryPrice) * trade.quantity;
              const pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
              const progress = getProgress(currentPrice, trade.entryPrice, trade.targetPrice);
              const isClosing = closingTradeId === trade.id;
              
              // Exit Suggestion Logic
              let suggestion = 'HOLD';
              let suggestionColor = 'bg-slate-700 text-slate-300';
              
              if (currentPrice >= trade.targetPrice) {
                 suggestion = 'TAKE PROFIT';
                 suggestionColor = 'bg-emerald-500 text-white animate-pulse shadow-lg shadow-emerald-500/20';
              } else if (currentPrice <= trade.stopLoss) {
                 suggestion = 'STOP LOSS';
                 suggestionColor = 'bg-rose-500 text-white animate-pulse shadow-lg shadow-rose-500/20';
              } else if (pnlPercent > 1.5) {
                 suggestion = 'TRAIL SL';
                 suggestionColor = 'bg-blue-500 text-white';
              }

              return (
                <div key={trade.id} className="p-4 hover:bg-slate-800/30 transition-colors group">
                   <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                      
                      {/* Left: Symbol & Strategy */}
                      <div className="w-full md:w-1/4">
                         <div className="flex items-center justify-between md:justify-start gap-3 mb-1">
                            <span className="font-black text-lg text-white">{trade.symbol}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all ${suggestionColor}`}>
                               {suggestion}
                            </span>
                         </div>
                         <div className="text-xs text-slate-400 flex items-center gap-2">
                            <span className="bg-slate-800 px-1.5 py-0.5 rounded">{trade.strategyName}</span>
                            <span>{trade.quantity} Qty</span>
                         </div>
                      </div>

                      {/* Middle: Prices & Progress */}
                      <div className="w-full md:flex-1 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 items-center">
                         <div>
                            <div className="text-[10px] text-slate-500 uppercase font-bold">Entry</div>
                            <div className="font-mono text-sm text-slate-300">₹{trade.entryPrice.toFixed(2)}</div>
                         </div>
                         <div>
                            <div className="text-[10px] text-slate-500 uppercase font-bold">Live Price</div>
                            <div className={`font-mono text-sm font-bold flex items-center gap-1 ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                               ₹{currentPrice.toFixed(2)}
                               {pnl >= 0 ? <ArrowUpRight className="w-3 h-3"/> : <ArrowDownRight className="w-3 h-3"/>}
                            </div>
                         </div>
                         
                         {/* P&L */}
                         <div className="bg-slate-900/50 p-2 rounded border border-slate-700/50">
                            <div className="text-[10px] text-slate-500 uppercase font-bold">Unrealized P&L</div>
                            <div className={`font-mono text-sm font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                               {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(0)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                            </div>
                         </div>

                         {/* Target Progress */}
                         <div className="w-full">
                            <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                               <span>Target</span>
                               <span className={progress >= 100 ? 'text-emerald-400 font-bold' : ''}>{progress.toFixed(0)}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                               <div 
                                 className={`h-full rounded-full transition-all duration-500 ${progress >= 100 ? 'bg-emerald-400' : pnl >= 0 ? 'bg-blue-500' : 'bg-slate-600'}`} 
                                 style={{ width: `${progress}%` }} 
                               />
                            </div>
                         </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="w-full md:w-auto flex items-center justify-end gap-2 mt-2 md:mt-0">
                         {!brokerState.angel && (
                           <div className="relative group/edit">
                              <input 
                                type="number" 
                                placeholder={currentPrice.toFixed(2)}
                                className="w-24 bg-slate-900 border border-slate-600 rounded-l px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500 font-mono text-right"
                                value={exitPriceInputs[trade.id] || ''}
                                onChange={(e) => handleExitPriceChange(trade.id, e.target.value)}
                              />
                           </div>
                         )}
                         
                         <button 
                              onClick={() => handleCloseClick(trade)}
                              disabled={isClosing}
                              className={`bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-r text-xs font-bold transition-all border-l border-emerald-700 flex items-center gap-2 ${brokerState.angel ? 'rounded-l pl-4' : ''}`}
                            >
                              {isClosing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                              {isClosing ? (brokerState.angel ? 'Fetching...' : 'Exiting') : 'Exit'}
                         </button>
                         <button onClick={() => onDeleteTrade(trade.id)} className="ml-2 p-2 text-slate-600 hover:text-rose-400 rounded-lg hover:bg-slate-700/50 transition-colors">
                            <Trash2 className="w-4 h-4" />
                         </button>
                      </div>
                   </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Closed Positions (History) */}
      {closedTrades.length > 0 && (
        <div className="glass-panel rounded-xl overflow-hidden border border-slate-700">
          <div className="p-4 bg-slate-800/50 border-b border-slate-700">
            <h3 className="font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Trade History
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-400 uppercase bg-slate-800/30">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3">Strategy</th>
                  <th className="px-4 py-3 text-right">Entry</th>
                  <th className="px-4 py-3 text-right">Exit</th>
                  <th className="px-4 py-3 text-right">P&L</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {closedTrades.slice().reverse().map(trade => (
                  <tr key={trade.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono">{new Date(trade.entryDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-mono font-bold text-white">{trade.symbol}</td>
                    <td className="px-4 py-3 text-slate-300 text-xs">
                        <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">{trade.strategyName}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400 text-right">₹{trade.entryPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono text-slate-400 text-right">₹{trade.exitPrice?.toFixed(2)}</td>
                    <td className={`px-4 py-3 font-mono font-bold text-right ${(trade.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {(trade.pnl || 0) >= 0 ? '+' : ''}₹{trade.pnl?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                       <button onClick={() => onDeleteTrade(trade.id)} className="text-slate-600 hover:text-rose-400 p-1 rounded hover:bg-slate-800">
                          <Trash2 className="w-4 h-4" />
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaperTradingDashboard;
