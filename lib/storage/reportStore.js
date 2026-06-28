/**
 * Quorum Client-Side Storage Layer (IndexedDB)
 * 
 * Safe for Next.js SSR. Only runs in browser context.
 * Manages two object stores:
 * - 'reports': Stores complete analyzed report payloads (keyed by 'id')
 * - 'watchlist': Stores symbols the user is monitoring (keyed by 'ticker')
 */

import { sampleReports } from './sampleReports.js';

const DB_NAME = 'quorum_db';
const DB_VERSION = 1;

/**
 * Initializes the IndexedDB database.
 */
function initDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return resolve(null); // Return null on SSR
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB database error:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create reports store
      if (!db.objectStoreNames.contains('reports')) {
        db.createObjectStore('reports', { keyPath: 'id' });
      }
      
      // Create watchlist store
      if (!db.objectStoreNames.contains('watchlist')) {
        db.createObjectStore('watchlist', { keyPath: 'ticker' });
      }
    };
  });
}

/**
 * Saves or updates an investment report in the database.
 */
export async function saveReport(report) {
  const db = await initDB();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['reports'], 'readwrite');
    const store = transaction.objectStore('reports');
    
    // Ensure structure matches
    const dataToSave = {
      ...report,
      id: report.id || report.reportId || crypto.randomUUID(),
      createdAt: report.createdAt || new Date().toISOString()
    };

    const request = store.put(dataToSave);

    request.onsuccess = () => resolve(dataToSave);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieves a report by its unique ID.
 */
export async function getReport(id) {
  const db = await initDB();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['reports'], 'readonly');
    const store = transaction.objectStore('reports');
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieves all saved investment reports.
 */
export async function getAllReports() {
  const db = await initDB();
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['reports'], 'readonly');
    const store = transaction.objectStore('reports');
    const request = store.getAll();

    request.onsuccess = async () => {
      let results = request.result || [];
      const hasSeeded = typeof window !== 'undefined' ? window.localStorage.getItem('quorum_db_seeded') === 'true' : false;

      if (results.length === 0 && !hasSeeded) {
        try {
          console.log('Seeding IndexedDB with sample reports...');
          const writeTx = db.transaction(['reports', 'watchlist'], 'readwrite');
          const reportsStore = writeTx.objectStore('reports');
          const watchlistStore = writeTx.objectStore('watchlist');

          for (const report of sampleReports) {
            reportsStore.put(report);
            watchlistStore.put({
              ticker: report.ticker,
              name: report.companyName,
              sector: report.sector,
              price: report.fullPayload.quote.price,
              changePercent: report.fullPayload.quote.changePercent,
              addedAt: new Date().toISOString()
            });
          }

          writeTx.oncomplete = () => {
            if (typeof window !== 'undefined') {
              window.localStorage.setItem('quorum_db_seeded', 'true');
            }
            resolve(sampleReports);
          };
          writeTx.onerror = (err) => {
            console.error('Failed to commit seed transaction:', err);
            resolve([]);
          };
        } catch (seedErr) {
          console.error('Failed to seed sample reports:', seedErr);
          resolve([]);
        }
      } else {
        if (results.length === 0) {
          resolve([]);
          return;
        }
        // Sort reports by date (newest first)
        results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        resolve(results);
      }
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Deletes a saved report by ID.
 */
export async function deleteReport(id) {
  const db = await initDB();
  if (!db) return false;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['reports'], 'readwrite');
    const store = transaction.objectStore('reports');
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Pins or unpins a company to the watchlist.
 */
export async function toggleWatchlist(ticker, name = '', sector = '', price = null, changePercent = null) {
  const db = await initDB();
  if (!db) return null;

  const cleanTicker = ticker.toUpperCase();
  const exists = await isInWatchlist(cleanTicker);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['watchlist'], 'readwrite');
    const store = transaction.objectStore('watchlist');
    
    if (exists) {
      const request = store.delete(cleanTicker);
      request.onsuccess = () => resolve({ ticker: cleanTicker, action: 'removed' });
      request.onerror = (e) => reject(e.target.error);
    } else {
      const newItem = {
        ticker: cleanTicker,
        name: name || ticker,
        sector: sector || 'Unknown',
        price: price || 0,
        changePercent: changePercent || 0,
        addedAt: new Date().toISOString()
      };
      const request = store.put(newItem);
      request.onsuccess = () => resolve({ ...newItem, action: 'added' });
      request.onerror = (e) => reject(e.target.error);
    }
  });
}

/**
 * Checks if a ticker is currently pinned to the watchlist.
 */
export async function isInWatchlist(ticker) {
  const db = await initDB();
  if (!db) return false;

  const cleanTicker = ticker.toUpperCase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['watchlist'], 'readonly');
    const store = transaction.objectStore('watchlist');
    const request = store.get(cleanTicker);

    request.onsuccess = () => resolve(!!request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Gets all tickers currently in the watchlist.
 */
export async function getWatchlist() {
  const db = await initDB();
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['watchlist'], 'readonly');
    const store = transaction.objectStore('watchlist');
    const request = store.getAll();

    request.onsuccess = () => {
      const results = request.result || [];
      results.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
      resolve(results);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}
