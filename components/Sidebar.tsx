import React from 'react';
import { LayoutDashboard, LineChart, BookOpen, PieChart, FlaskConical, Newspaper, X } from 'lucide-react';
import { View } from '../types';

interface SidebarProps {
  activeView: View;
  onSelectView: (view: View) => void;
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, onSelectView, isOpen, onClose }) => {
  const menuItems = [
    { id: 'SCANNER', label: 'Market Scanner', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'WATCHLIST', label: 'Watchlist', icon: <LineChart className="w-5 h-5" /> },
    { id: 'PORTFOLIO', label: 'Paper Portfolio', icon: <PieChart className="w-5 h-5" /> },
    { id: 'BACKTEST', label: 'Backtest Engine', icon: <FlaskConical className="w-5 h-5" /> },
    
    // ✅ THIS IS THE MISSING BUTTON
    { id: 'NEWS', label: 'News Intelligence', icon: <Newspaper className="w-5 h-5" /> },
    
    { id: 'STRATEGIES', label: 'Strategy Guide', icon: <BookOpen className="w-5 h-5" /> },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm" onClick={onClose} />
      )}

      {/* Sidebar Container - Uses flex-col to prevent overlap mess */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        {/* 1. Header */}
        <div className="p-6 flex justify-between items-center shrink-0">
          <h1 className="text-2xl font-black bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent tracking-tighter">
            ALGO.PRO
          </h1>
          <button onClick={onClose} className="md:hidden text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 2. Navigation List (Flex Grow ensures it takes available space) */}
        <nav className="px-4 space-y-2 mt-4 flex-1 overflow-y-auto">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onSelectView(item.id as View);
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
                activeView === item.id 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* 3. Bottom Status (Pushed to bottom safely) */}
        <div className="p-6 shrink-0 mt-auto">
           <div className="p-4 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">System Status</div>
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                 Engine Online
              </div>
           </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;