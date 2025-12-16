import React, { useState, useEffect, useRef } from 'react';
import { AutoTrader, AutoTraderConfig } from '../services/autoTrader';
import { AngelOne } from '../services/angel';
import { BrokerState } from '../types';
import { StockSelector } from '../services/stockSelection'; // ✅ IMPORT THIS
import { 
  Play, Square, Settings, Activity, Terminal, 
  Shield, Search, RefreshCw 
} from 'lucide-react';

interface Props {
  brokerState: BrokerState;
}

const AutoTraderDashboard: React.FC<Props> = ({ brokerState }) => {
  const [trader, setTrader] = useState<AutoTrader | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isScanning, setIsScanning] = useState(false); // ✅ SCAN STATE
  
  const [config, setConfig] = useState<AutoTraderConfig>({
    capital: 50000,
    riskPerTrade: 1, 
    maxDailyLoss: 2000,
    targetMultiplier: 2,
    enableTrailingSL: true,
    symbols: ['SBIN', 'RELIANCE', 'INFY', 'TATASTEEL'], // Default
    maxOpenPositions: 3 
  });

  const [logs, setLogs] = useState<string[]>([]);
  const [activeTrades, setActiveTrades] = useState<any[]>([]);
  const [dailyPnL, setDailyPnL] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // --- INIT TRADER ---
  useEffect(() => {
    if (brokerState.angel && !trader) {
      const angel = new AngelOne(brokerState.angel);
      const newTrader = new AutoTrader(
        angel, config, 
        (status) => {
           setIsRunning(status.isRunning);
           setActiveTrades(status.activeTrades);
           setDailyPnL(status.dailyPnL);
        },
        (msg) => setLogs(prev => [...prev.slice(-49), msg])
      );
      setTrader(newTrader);
    }
  }, [brokerState]);

  // --- POLLING ENGINE ---
  useEffect(() => {
    if (!isRunning || !trader || !brokerState.angel) return;
    const angel = new AngelOne(brokerState.angel);
    setLogs(prev => [...prev, `[System] Starting Active Market Poll...`]);

    const intervalId = setInterval(async () => {
        for (const sym of config.symbols) {
            try {
                const token = await angel.searchSymbolToken(sym);
                if (token) {
                    const ltpData = await angel.getLtpValue("NSE", token, sym);
                    if (ltpData && ltpData.price > 0) {
                        trader.processTick(sym, ltpData.price);
                    }
                }
            } catch (e) {}
        }
    }, 3000); 

    return () => { clearInterval(intervalId); setLogs(prev => [...prev, `[System] Polling Stopped.`]); };
  }, [isRunning, config.symbols]); 

  // --- ⚡ AUTO-SCANNER FUNCTION ---
  const handleAutoScan = async () => {
    if (!brokerState.angel) return;
    setIsScanning(true);
    setLogs(prev => [...prev, `[Scanner] 🚀 Starting Market Scan (This takes ~30s)...`]);
    
    try {
        const angel = new AngelOne(brokerState.angel);
        // Run the Stock Selector
        const candidates = await StockSelector.scanUniverse(angel, (msg) => {
            setLogs(prev => [...prev, `[Scanner] ${msg}`]);
        });

        if (candidates.length > 0) {
            // Take Top 5 Stocks
            const bestPicks = candidates.slice(0, 5).map(c => c.symbol);
            
            // ✅ AUTO-UPDATE CONFIG
            setConfig(prev => ({ ...prev, symbols: bestPicks }));
            if(trader) trader.updateConfig({ ...config, symbols: bestPicks });

            setLogs(prev => [...prev, `[Scanner] ✅ Watchlist Updated: ${bestPicks.join(', ')}`]);
        } else {
            setLogs(prev => [...prev, `[Scanner] ⚠️ No valid Swing Candidates found.`]);
        }
    } catch(e) {
        setLogs(prev => [...prev, `[Scanner] ❌ Error: ${e}`]);
    } finally {
        setIsScanning(false);
    }
  };

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const handleStart = () => { if (trader) { trader.updateConfig(config); trader.start(); } };
  const handleStop = () => { if (trader) trader.stop(); };

  if (!brokerState.angel) return <div className="p-10 text-center text-slate-500">Connect Angel One first.</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
      
      <div className="space-y-6">
         {/* STATUS CARD */}
         <div className={`p-6 rounded-2xl border ${isRunning ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-800 border-slate-700'}`}>
            <div className="flex justify-between items-start mb-4">
               <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                     <Activity className={`w-5 h-5 ${isRunning ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
                     Bot Status
                  </h2>
                  <p className={`text-sm font-mono mt-1 ${isRunning ? 'text-emerald-400' : 'text-slate-500'}`}>
                     {isRunning ? '● RUNNING' : '○ STOPPED'}
                  </p>
               </div>
               
               {isRunning ? (
                 <button onClick={handleStop} className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-rose-900/20 transition-all">
                    <Square className="w-4 h-4 fill-current" /> STOP
                 </button>
               ) : (
                 <button onClick={handleStart} className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-all">
                    <Play className="w-4 h-4 fill-current" /> START
                 </button>
               )}
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-700/50">
               <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Session P&L</div>
                  <div className={`text-xl font-mono font-bold ${dailyPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                     {dailyPnL >= 0 ? '+' : ''}₹{dailyPnL.toFixed(2)}
                  </div>
               </div>
               <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Active Trades</div>
                  <div className="text-xl font-mono font-bold text-white">{activeTrades.length}</div>
               </div>
            </div>
         </div>

         {/* CONFIGURATION */}
         <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-white font-bold flex items-center gap-2 mb-4">
               <Settings className="w-4 h-4 text-blue-400" /> Configuration
            </h3>
            
            {/* ✅ NEW SCANNER BUTTON */}
            <button 
                onClick={handleAutoScan} 
                disabled={isRunning || isScanning}
                className={`w-full mb-4 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg text-sm ${
                    isScanning 
                    ? 'bg-slate-700 text-slate-400 cursor-wait' 
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'
                }`}
            >
                {isScanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {isScanning ? 'Scanning Market...' : 'Auto-Select Best Stocks'}
            </button>

            <div className="space-y-3">
               <div>
                 <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Watchlist (Will Update Automatically)</label>
                 <input type="text" value={config.symbols.join(', ')} disabled className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-400 font-mono text-xs cursor-not-allowed" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div>
                     <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Capital (₹)</label>
                     <input type="number" value={config.capital} onChange={(e) => setConfig({...config, capital: parseFloat(e.target.value)})} disabled={isRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono text-xs" />
                  </div>
                  <div>
                     <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Max Positions</label>
                     <input type="number" value={config.maxOpenPositions} onChange={(e) => setConfig({...config, maxOpenPositions: parseFloat(e.target.value)})} disabled={isRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono text-xs" />
                  </div>
               </div>
            </div>
         </div>
      </div>

      {/* LOGS & TRADES */}
      <div className="lg:col-span-2 space-y-6">
         <div className="bg-[#0b1120] rounded-xl border border-slate-800 overflow-hidden flex flex-col h-[300px]">
            <div className="bg-slate-900/50 p-3 border-b border-slate-800 flex items-center gap-2 text-xs font-bold text-slate-400 uppercase">
               <Terminal className="w-4 h-4" /> System Logs
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1">
               {logs.map((log, i) => (
                  <div key={i} className={`border-b border-slate-800/30 pb-1 mb-1 ${
                      log.includes('ERROR') || log.includes('❌') ? 'text-rose-400' : 
                      log.includes('BUY') || log.includes('✅') ? 'text-emerald-400' : 
                      log.includes('Scanner') ? 'text-blue-300' : 'text-slate-300'
                  }`}>
                     <span className="text-slate-500 mr-2">{log.substring(1, 12) || '[System]'}</span>
                     {log.startsWith('[') ? log.split(']').slice(1).join(']') : log}
                  </div>
               ))}
               <div ref={logsEndRef} />
            </div>
         </div>

         <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 font-bold text-white flex gap-2">
                <Shield className="w-4 h-4 text-emerald-400" /> Active Positions
            </div>
            <div className="overflow-x-auto">
               <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-500 uppercase font-bold">
                     <tr>
                        <th className="p-3">Symbol</th>
                        <th className="p-3 text-right">Qty</th>
                        <th className="p-3 text-right">Entry</th>
                        <th className="p-3 text-right">P&L</th>
                        <th className="p-3 text-right">Status</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                     {activeTrades.length === 0 ? <tr><td colSpan={5} className="p-4 text-center text-slate-500">No active trades.</td></tr> : activeTrades.map((t, i) => (
                        <tr key={i}>
                           <td className="p-3 font-bold text-white">{t.symbol}</td>
                           <td className="p-3 text-right text-slate-300">{t.quantity}</td>
                           <td className="p-3 text-right text-slate-300">{t.entryPrice}</td>
                           <td className={`p-3 text-right font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{t.pnl.toFixed(2)}</td>
                           <td className="p-3 text-right text-emerald-400 uppercase font-bold">{t.status}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>
      </div>
    </div>
  );
};

export default AutoTraderDashboard;