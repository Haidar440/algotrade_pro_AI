import React, { useState, useEffect } from 'react';
import { BrokerState, AngelOrderParams } from '../types';
import { AngelOne } from '../services/angel';
import { X, Loader2, TrendingUp, TrendingDown, Wallet } from 'lucide-react';

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  ltp: number;
  brokerState: BrokerState;
  onSuccess?: (orderId: string) => void;
}

const TradeModal: React.FC<TradeModalProps> = ({ isOpen, onClose, symbol, ltp, brokerState, onSuccess }) => {
  const [quantity, setQuantity] = useState(1);
  const [transactionType, setTransactionType] = useState<'BUY' | 'SELL'>('BUY');
  const [productType, setProductType] = useState<'INTRADAY' | 'DELIVERY'>('INTRADAY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  
  // ✅ FIX: Initialize state, but don't force-update it constantly
  const [limitPrice, setLimitPrice] = useState(ltp);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ✅ THE FIX: Only reset price when the modal OPENS. 
  // We removed 'ltp' from the dependency array so live updates won't overwrite your typing.
  useEffect(() => {
    if (isOpen) {
        setLimitPrice(ltp);
    }
  }, [isOpen]); 

  if (!isOpen) return null;

  const handlePlaceOrder = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const angel = new AngelOne(brokerState.angel);
      
      const params: AngelOrderParams = {
        variety: 'NORMAL',
        tradingsymbol: `${symbol}-EQ`, 
        symboltoken: await angel.resolveToken(symbol),
        transactiontype: transactionType,
        exchange: 'NSE',
        ordertype: orderType,
        producttype: productType,
        duration: 'DAY',
        price: orderType === 'MARKET' ? "0" : limitPrice.toString(),
        quantity: quantity.toString()
      };

      const res = await angel.placeOrder(params);
      setSuccessMsg(`Order Placed! ID: ${res.orderid}`);
      if (onSuccess) onSuccess(res.orderid);
      
      setTimeout(onClose, 2000);
    } catch (err: any) {
      setError(err.message || "Order Failed");
    } finally {
      setLoading(false);
    }
  };

  const estimatedValue = (orderType === 'MARKET' ? ltp : limitPrice) * quantity;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className={`p-4 flex justify-between items-center ${transactionType === 'BUY' ? 'bg-emerald-500/10 border-b border-emerald-500/20' : 'bg-rose-500/10 border-b border-rose-500/20'}`}>
          <div>
            <h2 className={`text-xl font-black ${transactionType === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {transactionType} {symbol}
            </h2>
            <p className="text-xs text-slate-400">LTP: ₹{ltp.toFixed(2)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-6 h-6" /></button>
        </div>

        <div className="p-6 space-y-5">
          
          {/* Order Type Toggle */}
          <div className="flex bg-slate-800 p-1 rounded-lg">
             {['BUY', 'SELL'].map(type => (
               <button 
                 key={type}
                 onClick={() => setTransactionType(type as any)}
                 className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
                   transactionType === type 
                   ? (type === 'BUY' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white') 
                   : 'text-slate-400 hover:text-white'
                 }`}
               >
                 {type}
               </button>
             ))}
          </div>

          {/* Configuration */}
          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Product</label>
                <select 
                  value={productType} 
                  onChange={(e) => setProductType(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                >
                   <option value="INTRADAY">Intraday (MIS)</option>
                   <option value="DELIVERY">Delivery (CNC)</option>
                </select>
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Type</label>
                <select 
                  value={orderType} 
                  onChange={(e) => setOrderType(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                >
                   <option value="MARKET">Market</option>
                   <option value="LIMIT">Limit</option>
                </select>
             </div>
          </div>

          {/* Quantity & Price */}
          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Quantity</label>
                <input 
                  type="number" 
                  min="1"
                  value={quantity}
                  onChange={e => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-emerald-500 outline-none"
                />
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Price (₹)</label>
                <input 
                  type="number" 
                  // If Market Order, show 0 or disable. If Limit, show user input.
                  value={orderType === 'MARKET' ? 0 : limitPrice}
                  disabled={orderType === 'MARKET'}
                  onChange={e => setLimitPrice(parseFloat(e.target.value))}
                  className={`w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono outline-none ${orderType === 'MARKET' ? 'opacity-50 cursor-not-allowed' : 'focus:border-emerald-500'}`}
                />
             </div>
          </div>

          {/* Margin Info */}
          <div className="flex justify-between items-center text-sm p-3 bg-slate-800/50 rounded-lg border border-slate-700">
             <span className="text-slate-400 flex items-center gap-2"><Wallet className="w-4 h-4" /> Margin Req.</span>
             <span className="font-mono font-bold text-white">₹{estimatedValue.toFixed(2)}</span>
          </div>

          {/* Feedback */}
          {error && <p className="text-xs text-rose-400 text-center font-bold">{error}</p>}
          {successMsg && <p className="text-xs text-emerald-400 text-center font-bold">{successMsg}</p>}

          {/* Action Button */}
          <button 
            onClick={handlePlaceOrder}
            disabled={loading}
            className={`w-full py-3 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-all ${
               loading ? 'opacity-50 cursor-not-allowed' : ''
            } ${
               transactionType === 'BUY' 
               ? 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20' 
               : 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-900/20'
            }`}
          >
             {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : `${transactionType} ORDER`}
          </button>

        </div>
      </div>
    </div>
  );
};

export default TradeModal;  