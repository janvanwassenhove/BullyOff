/**
 * IndexedDB persistence (ADR-007): object stores `saves` (one slot per name) and
 * `settings`. JSON documents with the versioned header from @bullyoff/season.
 */
import type { SaveFile } from '@bullyoff/season';

const DB = 'bullyoff', VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves'); if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings'); };
    req.onsuccess = () => { resolve(req.result); };
    req.onerror = () => { reject(req.error ?? new Error('indexedDB open failed')); };
  });
}
function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode); const r = fn(t.objectStore(store));
    r.onsuccess = () => { resolve(r.result); }; r.onerror = () => { reject(r.error ?? new Error('idb request failed')); };
  }));
}
export const saveSlot = (name: string, doc: SaveFile): Promise<IDBValidKey> => tx('saves', 'readwrite', (s) => s.put(doc, name));
export const loadSlot = (name: string): Promise<SaveFile | undefined> => tx('saves', 'readonly', (s) => s.get(name) as IDBRequest<SaveFile | undefined>);
export const listSlots = (): Promise<string[]> => tx('saves', 'readonly', (s) => s.getAllKeys()).then((k) => k.map(String));
export const deleteSlot = (name: string): Promise<undefined> => tx('saves', 'readwrite', (s) => s.delete(name));
export async function persistStorage(): Promise<void> { try { await navigator.storage.persist(); } catch { /* not supported */ } }
