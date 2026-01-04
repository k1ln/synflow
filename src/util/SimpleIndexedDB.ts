export class SimpleIndexedDB {
    private dbName: string;
    private storeName: string;
    private db: IDBDatabase | null = null;
    private uuid: string;

    constructor(dbName: string, storeName: string) {
        this.dbName = dbName;
        this.storeName = storeName;
        this.uuid = crypto.randomUUID();
    }

    public async open(): Promise<void> {
        if (this.db) return;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 2);
            request.onupgradeneeded = (event) => {
                const db = request.result;
                // Check if the store exists, if not, create it.
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
                // Handle version changes from other tabs
                db.onversionchange = () => {
                    db.close();
                    alert("A new version of this page is ready. Please reload or close this tab!");
                };
            };
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            request.onerror = (event) => {
                console.error(`[SimpleIndexedDB] open error for ${this.dbName}`, event);
                reject(event);
            };
        });
    }

    public async put(key: string, value: any): Promise<void> {
        await this.open();
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const request = store.put({ id: key, ...value });
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event);
        });
    }

    /**
     * Get by key, or use '*' or 'prefix*' for wildcard.
     */
    public async get(key: string): Promise<any[]> {
        await this.open();
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);

            if (key === '*' || key === null) {
                // Get all
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = (event) => reject(event);
            } else if (key.includes('*')) {
                // Prefix wildcard
                const prefix = key.replace('*', '');
                const results: any[] = [];
                const req = store.openCursor();
                req.onsuccess = (event: any) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        if (cursor.key.startsWith(prefix)) {
                            results.push(cursor.value);
                        }
                        cursor.continue();
                    } else {
                        resolve(results);
                    }
                };
                req.onerror = (event) => reject(event);
            } else {
                // Exact match
                const req = store.get(key);
                req.onsuccess = () => {
                    resolve(req.result ? [req.result] : []);
                };
                req.onerror = (event) => reject(event);
            }
        });
    }

    public async exportToJSON(): Promise<string> {
        const allObjects = await this.get('*');
        return JSON.stringify(allObjects, null, 2);
    }

    /** Delete a single key by id. Resolves when complete. */
    public async delete(key: string): Promise<void> {
        if(!key) return;
        await this.open();
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const req = store.delete(key);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e);
        });
    }

    /**
     * Import objects from a JSON string. Overwrites objects with the same id.
     */
    public async importFromJSON(json: string): Promise<void> {
    const objects = JSON.parse(json);
    if (!Array.isArray(objects)) throw new Error('Invalid JSON format: expected an array');
    await this.open();
    return new Promise((resolve, reject) => {
        const tx = this.db!.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);

        // Clear the store before importing
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => {
            for (const obj of objects) {
                if (!obj.id) continue;
                store.put(obj);
            }
        };
        clearRequest.onerror = (event) => reject(event);

        tx.oncomplete = () => resolve();
        tx.onerror = (event) => reject(event);
    });
}
}