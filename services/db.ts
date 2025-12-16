// Ensure you have a Trade type defined in '../types' or change (trade: any)
import { Trade } from '../types'; 

const API_URL = 'http://localhost:5000/api';

export const DB_SERVICE = {
  
  // 1. Save a Trade
  saveTrade: async (trade: any) => {
    try {
      const response = await fetch(`${API_URL}/trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trade)
      });
      return await response.json();
    } catch (error) {
      console.error("❌ Failed to save trade:", error);
    }
  },

  // 2. Get History
  getTrades: async () => {
    try {
      const response = await fetch(`${API_URL}/trades`);
      return await response.json();
    } catch (error) {
      console.error("❌ Failed to fetch trades:", error);
      return [];
    }
  },

  // 3. Update Trade
  updateTrade: async (id: string, updates: any) => {
    try {
      const response = await fetch(`${API_URL}/trades/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      return await response.json();
    } catch (error) {
      console.error("❌ Failed to update trade:", error);
    }
  },

  // 4. Search Stocks
  searchStocks: async (query: string) => {
    try {
      const response = await fetch(`${API_URL}/search?q=${query}`);
      return await response.json();
    } catch (error) {
      console.error("❌ Search failed:", error);
      return [];
    }
  }
};