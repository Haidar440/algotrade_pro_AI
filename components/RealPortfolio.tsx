import React, { useEffect, useState } from 'react';
import { BrokerState, AngelHolding, AngelFundDetails } from '../types';
import { AngelOne } from '../services/angel';
import { Loader2, RefreshCw, Wallet, Briefcase } from 'lucide-react';

interface RealPortfolioProps {
  brokerState: BrokerState;
}

const RealPortfolio: React.FC<RealPortfolioProps> = ({ brokerState }) => {
  const [holdings, setHoldings] = useState<AngelHolding[]>([]);
  const [funds, setFunds] = useState<AngelFundDetails | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (!brokerState.angel) return;
    setLoading(true);
    try {
      const angel = new AngelOne(brokerState.angel);
      const [hData, fData] = await Promise.all([
         angel.getHoldings(),
         angel.getFunds()
      ]);
      setHoldings(hData);
      setFunds(fData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [brokerState]);

  if (!brokerState.angel) return <div className="p-8 text-slate-500">Please connect Angel One.</div>;

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">Angel One Portfolio</h2>
          <button onClick={fetchData} className="p-2 bg-slate-800 rounded hover:bg-slate-700">
             <RefreshCw className={`w-4 h-4 text-emerald-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
       </div>

       {/* Funds Card */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
             <div className="flex items-center gap-2 mb-2 text-slate-400 text-xs font-bold uppercase">
                <Wallet className="w-4 h-4" /> Available Cash
             </div>
             <div className="text-2xl font-mono text-white">₹{funds?.availablecash || '0.00'}</div>
          </div>
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
             <div className="flex items-center gap-2 mb-2 text-slate-400 text-xs font-bold uppercase">
                <Briefcase className="w-4 h-4" /> Total Holdings Value
             </div>
             <div className="text-2xl font-mono text-emerald-400">
                ₹{holdings.reduce((sum, h) => sum + (parseFloat(h.ltp) * parseFloat(h.quantity)), 0).toFixed(2)}
             </div>
          </div>
       </div>

       {/* Holdings Table */}
       <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left text-slate-400">
             <thead className="bg-slate-800 text-xs uppercase font-bold text-slate-300">
                <tr>
                   <th className="px-6 py-3">Symbol</th>
                   <th className="px-6 py-3">Qty</th>
                   <th className="px-6 py-3">Avg Price</th>
                   <th className="px-6 py-3">LTP</th>
                   <th className="px-6 py-3">P&L</th>
                </tr>
             </thead>
             <tbody>
                {holdings.map((h, i) => {
                   const pnl = parseFloat(h.profitandloss);
                   return (
                      <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/30">
                         <td className="px-6 py-4 font-bold text-white">{h.tradingsymbol}</td>
                         <td className="px-6 py-4">{h.quantity}</td>
                         <td className="px-6 py-4">₹{h.averageprice}</td>
                         <td className="px-6 py-4">₹{h.ltp}</td>
                         <td className={`px-6 py-4 font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {pnl >= 0 ? '+' : ''}{pnl}
                         </td>
                      </tr>
                   );
                })}
             </tbody>
          </table>
          {holdings.length === 0 && <div className="p-8 text-center">No Holdings Found</div>}
       </div>
    </div>
  );
};

export default RealPortfolio;