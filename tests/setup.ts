// Polyfill minimal browser APIs needed by apiClient in Node environment
if (!(globalThis as any).localStorage) {
  const store = new Map<string,string>();
  (globalThis as any).localStorage = {
    getItem: (k:string)=> store.has(k)? store.get(k)!: null,
    setItem: (k:string,v:string)=>{ store.set(k,String(v)); },
    removeItem: (k:string)=>{ store.delete(k); },
    clear: ()=> store.clear()
  };
}
if (!(globalThis as any).window) {
  (globalThis as any).window = globalThis;
}

// JWT secret & temp DB for backend when imported
process.env.JWT_SECRET = 'frontend-int-test-secret';
process.env.DB_FILE = require('path').join(require('os').tmpdir(), 'flowsynth-frontend-int.db');