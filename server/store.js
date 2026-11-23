'use strict';
/**
 * Storage for the Maydan server.
 *  - FirestoreStore: production on Google Cloud (STORE=firestore). Uses the Cloud Run service account; no keys in code.
 *  - FileStore: local development and tests (STORE=file). Writes JSON files under DATA_DIR (git-ignored).
 * Both expose the same small async API: get, set, del, list, tx (optimistic update of one document).
 */
const fs = require('fs');
const path = require('path');

class FileStore {
  constructor(dir) { this.dir = dir; fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); this.cache = new Map(); this.queue = Promise.resolve(); }
  file(col) { if (!/^[a-z_]+$/.test(col)) throw new Error('bad collection'); return path.join(this.dir, col + '.json'); }
  load(col) { if (!this.cache.has(col)) { let d = {}; try { d = JSON.parse(fs.readFileSync(this.file(col), 'utf8')); } catch (e) { d = {}; } this.cache.set(col, d); } return this.cache.get(col); }
  persist(col) { const f = this.file(col); const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.load(col)), { mode: 0o600 }); fs.renameSync(tmp, f); }
  async get(col, id) { const d = this.load(col)[id]; return d ? JSON.parse(JSON.stringify(d)) : null; }
  async set(col, id, val) { this.load(col)[id] = JSON.parse(JSON.stringify(val)); this.persist(col); }
  async del(col, id) { delete this.load(col)[id]; this.persist(col); }
  async list(col, filter) { const all = Object.values(this.load(col)).map((x) => JSON.parse(JSON.stringify(x))); return filter ? all.filter(filter) : all; }
  async count(col) { return Object.keys(this.load(col)).length; }
  async tx(col, id, fn) { const run = async () => { const cur = await this.get(col, id); const next = await fn(cur); if (next === undefined) return cur; if (next === null) await this.del(col, id); else await this.set(col, id, next); return next; }; const p = this.queue.then(run, run); this.queue = p.catch(() => {}); return p; }
}

class FirestoreStore {
  constructor() { const { Firestore } = require('@google-cloud/firestore'); this.db = new Firestore({ ignoreUndefinedProperties: true }); this.prefix = process.env.FIRESTORE_PREFIX || 'maydan_'; }
  c(col) { if (!/^[a-z_]+$/.test(col)) throw new Error('bad collection'); return this.db.collection(this.prefix + col); }
  async get(col, id) { const s = await this.c(col).doc(id).get(); return s.exists ? s.data() : null; }
  async set(col, id, val) { await this.c(col).doc(id).set(val); }
  async del(col, id) { await this.c(col).doc(id).delete(); }
  async list(col, filter) { const s = await this.c(col).limit(5000).get(); const all = s.docs.map((d) => d.data()); return filter ? all.filter(filter) : all; }
  async count(col) { const s = await this.c(col).count().get(); return s.data().count; }
  async tx(col, id, fn) { const ref = this.c(col).doc(id); return this.db.runTransaction(async (t) => { const s = await t.get(ref); const next = await fn(s.exists ? s.data() : null); if (next === undefined) return s.exists ? s.data() : null; if (next === null) t.delete(ref); else t.set(ref, next); return next; }); }
}

// ---------- binary files (attachments): local folder in development, Google Cloud Storage in production ----------
class LocalBlobs { constructor(dir) { this.dir = path.join(dir, 'files'); fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 }); } f(id) { if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw new Error('bad id'); return path.join(this.dir, id); }
  async put(id, buf) { fs.writeFileSync(this.f(id), buf, { mode: 0o600 }); } async get(id) { try { return fs.readFileSync(this.f(id)); } catch (e) { return null; } } async del(id) { try { fs.unlinkSync(this.f(id)); } catch (e) { /* gone */ } } }
class GcsBlobs { constructor(bucket) { const { Storage } = require('@google-cloud/storage'); this.b = new Storage().bucket(bucket); }
  async put(id, buf) { await this.b.file('files/' + id).save(buf, { resumable: false, contentType: 'application/octet-stream' }); }
  async get(id) { try { const [d] = await this.b.file('files/' + id).download(); return d; } catch (e) { return null; } } async del(id) { try { await this.b.file('files/' + id).delete(); } catch (e) { /* gone */ } } }
module.exports.makeBlobs = function makeBlobs() { if (process.env.FILES_BUCKET) return new GcsBlobs(process.env.FILES_BUCKET); return new LocalBlobs(process.env.DATA_DIR || path.join(__dirname, '..', 'data')); };

module.exports.makeStore = function makeStore() {
  const kind = process.env.STORE || 'file';
  if (kind === 'firestore') return new FirestoreStore();
  return new FileStore(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
};
