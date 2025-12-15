
import React, { useState } from 'react';
import { SignalFeedItem } from '../types';
import Sparkline from './Sparkline';
import { Trash2, ArrowRight, Target, ShieldAlert, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react';

interface WatchlistRowProps {
  item: SignalFeedItem;
  onAnalyze: (symbol: string) => void;
  onDelete: (id: string) => void;
}

const WatchlistRow: React.FC<WatchlistRowProps> = ({ item, onAnalyze, onDelete }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isBuy = item.signal.includes('BUY');
  const colorClass = isBuy ? 'text-emerald-400' : 'text-rose-400';
  const strokeColor = isBuy ? '#34d399' : '#fb7185';
  
  // Metrics calculation
  const distToEntry = ((item.entry - item.price) / item.price) * 100;
  const distToTarget = ((item.target - item.price) / item.price) * 100;
  
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showDeleteConfirm) {
        setIsDeleting(true);
        // Small delay for animation
        setTimeout(() => onDelete(item.id), 300);
    } else {
        setShowDeleteConfirm(true);
        // Reset confirmation after 3 seconds
        setTimeout(() => setShowDeleteConfirm(false), 3000);
    }
  };

  return (
    <div 
      className={`relative overflow-hidden group mb-3 rounded-xl transition-all duration-300 ${isDeleting ? 'opacity-0 -translate-x-full h-0 mb-0' : 'opacity-100'}`}
    >
      {/* Main Card Content */}
      <div 
        onClick={() => onAnalyze(item.symbol)}
        className="glass-panel p-4 border border-slate-700 bg-slate-800/40 hover:bg-slate-800/60 transition-colors cursor-pointer flex items-center justify-between"
      >
        {/* Left: Stock Info */}
        <div className="flex items-center gap-3 min-w-[30%]">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg ${isBuy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
            {item.symbol[0]}
          </div>
          <div>
            <div className="font-bold text-white flex items-center gap-2">
               {item.symbol}
               <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                 {item.signal}
               </span>
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
               {item.strategy}
            </div>
          </div>
        </div>

        {/* Middle: Sparkline (Hidden on very small screens) */}
        <div className="hidden sm:block">
           <Sparkline price={item.price} changePercent={item.changePercent} color={strokeColor} />
        </div>

        {/* Right: Price & Metrics */}
        <div className="text-right min-w-[25%]">
           <div className="font-mono font-bold text-white">₹{item.price.toFixed(2)}</div>
           <div className={`text-[10px] font-bold ${item.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
           </div>
           
           <div className="mt-1 flex justify-end items-center gap-1 text-[9px] text-slate-500">
              {isBuy ? (
                 <>
                   <Target className="w-3 h-3 text-blue-400" />
                   <span className="text-blue-400">Target: {distToTarget > 0 ? '+' : ''}{distToTarget.toFixed(1)}%</span>
                 </>
              ) : (
                 <>
                   <ShieldAlert className="w-3 h-3 text-amber-400" />
                   <span className="text-amber-400">Entry: {distToEntry.toFixed(1)}%</span>
                 </>
              )}
           </div>
        </div>
        
        {/* Arrow / Chevron */}
        <div className="pl-4 text-slate-600 group-hover:text-white transition-colors">
           <ChevronRight className="w-5 h-5" />
        </div>
      </div>

      {/* Delete Button (Overlay or Slide Action) */}
      <button
        onClick={handleDeleteClick}
        className={`absolute top-0 bottom-0 right-0 z-10 flex items-center justify-center transition-all duration-300 ${showDeleteConfirm ? 'w-20 bg-rose-600 text-white' : 'w-12 bg-transparent text-transparent group-hover:text-slate-500'}`}
      >
        <Trash2 className="w-5 h-5" />
      </button>
    </div>
  );
};

export default WatchlistRow;
