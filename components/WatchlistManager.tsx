import React, { useState, useEffect, useMemo } from 'react';
import { DB_SERVICE } from '../services/db';
import { BrokerState, SignalFeedItem } from '../types';
import Sparkline from './Sparkline';
import axios from 'axios';
import AddStockModal from './AddStockModal';
import { io } from 'socket.io-client'; // ✅ 1. Import Socket.io client
import { 
  Search, Plus, Trash2, TrendingUp, TrendingDown, 
  ChevronRight, List, AlertCircle, Loader2, Edit3, Check, RotateCcw, X
} from 'lucide-react';

// ✅ 2. Initialize the socket connection to your backend
const socket = io('http://localhost:5000');

interface Props {
  onAnalyze: (symbol: string) => void;
  brokerState: BrokerState;
}

// Extension of the type to handle the visual flashing effect locally
interface WatchlistItem extends SignalFeedItem {
  token: string;
  lastChange?: 'flash-up' | 'flash-down' | '';
}

const WatchlistManager: React.FC<Props> = ({ onAnalyze, brokerState }) => {
  const [listNames, setListNames] = useState<string[]>([]);
  const [activeList, setActiveList] = useState('Default');
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [pendingDeletions, setPendingDeletions] = useState<string[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const loadListNames = async () => {
    try {
      const names = await DB_SERVICE.getWatchlistNames();
      if (names.length > 0) {
        setListNames(names);
        if (!activeList) setActiveList(names[0]);
      }
    } catch (e) { console.error("Load names error", e); }
  };

  // Inside WatchlistManager.tsx

// ✅ UPDATED: loadItems to handle immediate subscription
   // algotrade-pro1/components/WatchlistManager.tsx

const loadItems = async () => {
  setLoading(true);
  try {
    const data = await DB_SERVICE.getWatchlist(activeList);
    const listItems = data?.items || [];
    
    // ✅ 1. Get initial prices for all tokens via API
    const updatedItems = await Promise.all(listItems.map(async (item: any) => {
      try {
        // This calls your backend proxy 'getLtpData'
        const response = await axios.post('http://localhost:5000/api/angel-proxy', {
          endpoint: 'getLtpData',
          data: {
            exchange: "NSE",
            symboltoken: item.token,
            tradingsymbol: item.symbol
          }
        });
        
        return {
          ...item,
          price: response.data.data?.ltp || item.price,
          changePercent: response.data.data?.close ? 
            ((response.data.data.ltp - response.data.data.close) / response.data.data.close * 100) : 0
        };
      } catch (err) {
        return item;
      }
    }));

    setItems(updatedItems);

    // ✅ 2. Subscribe for any further live updates
    updatedItems.forEach((item: any) => {
      if (item.token) socket.emit('subscribe', item.token);
    });

  } catch (e) { console.error("Load items error", e); }
  finally { setLoading(false); }
};
// ✅ UPDATED: Enhanced Price Listener
useEffect(() => {
    // ✅ Use a stable listener function
    const onPriceUpdate = (data: any) => {
        // 🔥 DEBUG: If you see this in your Browser F12 Console, prices WILL move
        console.log("📥 Incoming Tick:", data.token, "LTP:", data.lp);

        setItems(prevItems => prevItems.map(item => {
            // Type-safe check (convert both to string)
            if (String(item.token) === String(data.token)) {
                const newPrice = parseFloat(data.lp) || item.price;
                const flash = newPrice > item.price ? 'flash-up' : newPrice < item.price ? 'flash-down' : '';

                return {
                    ...item,
                    price: newPrice,
                    changePercent: parseFloat(data.pc) || item.changePercent,
                    lastChange: flash
                };
            }
            return item;
        }));
    };

    socket.on('price-update', onPriceUpdate);

    return () => {
        socket.off('price-update', onPriceUpdate);
    };
}, []);
  useEffect(() => { loadListNames(); }, []);
  useEffect(() => { if (activeList) loadItems(); }, [activeList]);

 

  // Inside WatchlistManager.tsx

const handleAddStock = async (stock: any) => {
    try {
        // ✅ 1. DUPLICATE CHECK
        // We check if the token already exists in our 'items' state
        const isDuplicate = items.some(item => String(item.token) === String(stock.token));
        
        if (isDuplicate) {
            alert(`⚠️ ${stock.symbol} is already in your watchlist!`);
            setIsAddModalOpen(false);
            return; // Stop execution here
        }

        console.log("🔍 Fetching data for new stock:", stock.symbol);

        // 2. Fetch the real price and close price
        const response = await axios.post('http://localhost:5000/api/angel-proxy', {
            endpoint: 'getLtpData',
            data: {
                exchange: "NSE",
                symboltoken: stock.token,
                tradingsymbol: stock.symbol
            }
        });

        const currentLtp = response.data.data?.ltp || 0;
        const closePrice = response.data.data?.close || 0;
        const calculatedChange = closePrice > 0 ? ((currentLtp - closePrice) / closePrice) * 100 : 0;

        // 3. Prepare the final stock object
        const stockWithData = {
            ...stock,
            price: currentLtp,
            changePercent: calculatedChange,
            id: stock.id || `stock-${stock.token}-${Date.now()}`, // Unique ID
        };

        // 4. Update the database and local state
        const updatedItems = [...items, stockWithData];
        await DB_SERVICE.saveWatchlist(activeList, updatedItems);
        setItems(updatedItems);
        
        // 5. Start real-time tracking
        if (stockWithData.token) {
            socket.emit('subscribe', stockWithData.token);
        }

    } catch (error) {
        console.error("❌ Failed to add stock:", error);
    } finally {
        setIsAddModalOpen(false);
    }
};
 const markForDeletion = (name: string) => {
    // 1. Safety check for the Default list
    if (name.toLowerCase() === 'default') {
        alert("⚠️ You cannot delete the Default watchlist.");
        return;
    }
    
    // 2. Add to pending list
    setPendingDeletions(prev => {
        if (prev.includes(name)) return prev; // Avoid duplicates in pending
        return [...prev, name];
    });
};

  const handleUndo = () => {
    setPendingDeletions(prev => prev.slice(0, -1));
  };

 const handleDone = async () => {
    if (pendingDeletions.length === 0) {
        setIsEditMode(false);
        return;
    }

    try {
        console.log("🗑️ Starting deletion for:", pendingDeletions);

        // 1. Delete from Database
        await Promise.all(
            pendingDeletions.map(name => 
                axios.delete(`http://localhost:5000/api/watchlists/${encodeURIComponent(name)}`)
            )
        );

        // 2. Update UI locally (Remove deleted names from the tabs)
        const updatedNames = listNames.filter(n => !pendingDeletions.includes(n));
        setListNames(updatedNames);

        // 3. Handle Active List Fallback
        // If we just deleted the list the user was looking at, switch to another one
        if (pendingDeletions.includes(activeList)) {
            const fallback = updatedNames.length > 0 ? updatedNames[0] : 'Default';
            setActiveList(fallback);
        }

        // 4. Reset states
        setPendingDeletions([]);
        setIsEditMode(false);
        console.log("✅ Watchlists deleted and UI updated.");

    } catch (error) {
        console.error("❌ Failed to delete watchlists:", error);
        alert("Could not delete watchlists. Make sure your backend is running.");
    }
};

  const handleCreateNewList = async () => {
    const name = prompt("Enter new Watchlist name:");
    if (name && !listNames.includes(name)) {
        await DB_SERVICE.saveWatchlist(name, []);
        await loadListNames();
        setActiveList(name);
    }
  };

  const handleDeleteItem = async (id: string) => {
    const newItems = items.filter(i => i.id !== id);
    setItems(newItems);
    await DB_SERVICE.saveWatchlist(activeList, newItems);
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => item.symbol.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [items, searchTerm]);

  return (
    <div className="space-y-6">
      
      {/* HORIZONTAL NAVIGATION & CONTROLS */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-0">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pr-4">
          {listNames.filter(n => !pendingDeletions.includes(n)).map(name => (
            <div key={name} className="relative group">
              <button
                onClick={() => !isEditMode && setActiveList(name)}
                className={`px-4 py-3 text-sm font-bold transition-all whitespace-nowrap border-b-2 flex items-center gap-2 ${
                  activeList === name && !isEditMode
                  ? 'text-blue-400 border-blue-400 bg-blue-400/5' 
                  : 'text-slate-500 border-transparent hover:text-slate-300'
                } ${isEditMode ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
              >
                {name}
                {isEditMode && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); markForDeletion(name); }}
                        className="p-1 hover:bg-rose-500/20 rounded-full text-rose-500 transition-all"
                    >
                        <X className="w-3 h-3" />
                    </button>
                )}
              </button>
            </div>
          ))}
          
          {!isEditMode && (
            <button 
                onClick={handleCreateNewList}
                className="p-2 ml-2 text-slate-500 hover:text-emerald-400 transition-colors"
                title="New List"
            >
                <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 pb-2">
            {!isEditMode && (
              <button 
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-500 shadow-lg shadow-blue-900/20 transition-all"
              >
                  <Plus className="w-3.5 h-3.5" /> Add Stock
              </button>
            )}

            {isEditMode ? (
                <div className="flex items-center gap-2 animate-in slide-in-from-right-2">
                    {pendingDeletions.length > 0 && (
                        <button onClick={handleUndo} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-700 transition-colors border border-slate-700">
                            <RotateCcw className="w-3.5 h-3.5" /> Undo
                        </button>
                    )}
                    <button onClick={handleDone} className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 transition-all">
                        <Check className="w-3.5 h-3.5" /> Done
                    </button>
                </div>
            ) : (
                <button onClick={() => setIsEditMode(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 text-slate-400 rounded-lg text-xs font-bold hover:text-white hover:bg-slate-800 transition-all border border-slate-700/50">
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                </button>
            )}
        </div>
      </div>

      {/* SEARCH BAR */}
      {!isEditMode && (
        <div className="flex justify-end">
            <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
                type="text"
                placeholder={`Search symbols in ${activeList}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:border-blue-500 outline-none transition-all"
            />
            </div>
        </div>
      )}

      {/* WATCHLIST TABLE */}
      <div className={`bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm transition-all duration-300 ${isEditMode ? 'opacity-30 blur-[2px] pointer-events-none' : 'opacity-100'}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950/50 text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-800">
              <tr>
                <th className="p-5">Instrument</th>
                <th className="p-5 text-center">Trend (24h)</th>
                <th className="p-5 text-right">LTP</th>
                <th className="p-5 text-right">Change</th>
                <th className="p-5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr><td colSpan={5} className="p-20 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-500 opacity-50"/></td></tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-20 text-center text-slate-500 italic">
                    {pendingDeletions.length > 0 ? "Reviewing deletions..." : "Watchlist is empty."}
                  </td>
                </tr>
              ) : filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-blue-400/[0.02] transition-colors group">
                  <td className="p-5">
                    <div className="flex items-center gap-3">
                       <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm ${item.changePercent >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                          {item.symbol.substring(0, 2)}
                       </div>
                       <div>
                          <div className="font-black text-white text-base tracking-tight">{item.symbol}</div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase">{item.strategy}</div>
                       </div>
                    </div>
                  </td>
                  <td className="p-5">
                     <div className="h-8 w-28 mx-auto opacity-70 group-hover:opacity-100 transition-opacity">
                        <Sparkline isPositive={item.changePercent >= 0} color={item.changePercent >= 0 ? '#10b981' : '#f43f5e'} id={item.id} />
                     </div>
                  </td>

                  {/* ✅ 6. UPDATED PRICE CELL FOR FLASHING EFFECT */}
                  <td className={`p-5 text-right font-mono font-bold transition-all duration-700 ${
                    item.lastChange === 'flash-up' ? 'text-emerald-400 flash-up' : 
                    item.lastChange === 'flash-down' ? 'text-rose-400 flash-down' : 'text-slate-300'
                  }`}>
                    ₹{item.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>

                  <td className={`p-5 text-right font-mono font-black text-sm ${item.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                  </td>
                  <td className="p-5">
                    <div className="flex justify-center gap-2">
                       <button onClick={() => onAnalyze(item.symbol)} className="p-2.5 bg-slate-800/50 hover:bg-blue-500/20 text-blue-400 rounded-xl transition-all border border-slate-700/50">
                          <ChevronRight className="w-4 h-4" />
                       </button>
                       <button onClick={() => handleDeleteItem(item.id)} className="p-2.5 bg-slate-800/50 hover:bg-rose-500/20 text-rose-500 rounded-xl transition-all border border-slate-700/50">
                          <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddStockModal 
          isOpen={isAddModalOpen} 
          onClose={() => setIsAddModalOpen(false)} 
          onAdd={handleAddStock} 
      />
    </div>
  );
};

export default WatchlistManager;