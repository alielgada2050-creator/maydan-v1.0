// Mock Apps Script runtime to exercise Maydan server code end-to-end.
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');

function makeEnv() {
  const props = {}; const cache = {}; const mails = []; const fetches = [];
  let activeEmail = 'owner@example.com';
  const sheets = {};
  function mkSheet(name) {
    const sh = { name, rows: [[]], prot: null,
      getRange(r, c, nr = 1, nc = 1) {
        return {
          setValues(v) { for (let i = 0; i < nr; i++) { sh.rows[r - 1 + i] = sh.rows[r - 1 + i] || []; for (let j = 0; j < nc; j++) sh.rows[r - 1 + i][c - 1 + j] = v[i][j]; } return this; },
          getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = sh.rows[r - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) o.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]); out.push(o); } return out; },
          setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; }, setNumberFormat() { return this; }
        };
      },
      setFrozenRows() {}, getMaxRows() { return 1000; }, setRightToLeft() {},
      getLastRow() { let n = sh.rows.length; while (n > 0 && (!sh.rows[n - 1] || sh.rows[n - 1].every(x => x === '' || x === undefined))) n--; return n; },
      appendRow(v) { sh.rows[sh.getLastRow()] = v.map(x => typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x); },
      deleteRow(r) { sh.rows.splice(r - 1, 1); },
      getProtections() { return sh.prot ? [sh.prot] : []; },
      protect() { sh.prot = { setDescription() {}, getEditors() { return []; }, removeEditors() {}, canDomainEdit() { return false; }, setDomainEdit() {} }; return sh.prot; }
    };
    // emulate Sheets stripping the leading apostrophe on setValues too
    const orig = sh.getRange;
    sh.getRange = (r, c, nr, nc) => { const g = orig(r, c, nr, nc); const sv = g.setValues; g.setValues = v => { sv(v.map(row => row.map(x => typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x))); return g; }; return g; };
    return sh;
  }
  const ss = { getId: () => 'SS1', getUrl: () => 'https://sheet', setSpreadsheetLocale() {}, setSpreadsheetTimeZone() {},
    getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets), deleteSheet(s) { delete sheets[s.name]; } };
  sheets['Sheet1'] = mkSheet('Sheet1');
  const files = [];
  const folder = (name) => ({ name, getId: () => 'F-' + name, getUrl: () => 'https://drive/' + name, createFolder: n => folder(n),
    createFile: (blob) => ({ getId: () => 'FILE1', getUrl: () => 'https://drive/file1' }),
    getFiles() { let i = 0; return { hasNext: () => i < files.length, next: () => files[i++] }; } });
  const toSigned = b => Array.from(b).map(x => x > 127 ? x - 256 : x);
  const env = {
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = String(v); } }) },
    SpreadsheetApp: { create: () => ss, openById: () => ss, ProtectionType: { SHEET: 'SHEET' } },
    DriveApp: { createFolder: n => folder(n), getFolderById: id => folder(id), getFileById: () => ({ moveTo() {}, makeCopy: (n) => { const f = { getUrl: () => 'https://drive/copy', getDateCreated: () => new Date(), setTrashed() {} }; files.push(f); return f; } }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }), getActiveUser: () => ({ getEmail: () => activeEmail }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => toSigned(crypto.createHash('sha256').update(String(s)).digest()),
      formatDate: (d, tz, f) => { const x = new Date(d.getTime() + 3 * 3600e3).toISOString(); if (f === 'yyyy-MM-dd') return x.slice(0, 10); if (f.includes("'T'")) return x.slice(0, 19); return x.slice(0, 16).replace('T', ' ').replace(':', '-'); },
      base64Encode: s => Buffer.from(s).toString('base64'), base64Decode: s => Array.from(Buffer.from(s, 'base64')), newBlob: () => ({})
    },
    CacheService: { getScriptCache: () => ({ get: k => (cache[k] && cache[k].exp > Date.now()) ? cache[k].v : null, put: (k, v, s) => { cache[k] = { v, exp: Date.now() + s * 1000 }; }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    MailApp: { sendEmail: m => mails.push(m), getRemainingDailyQuota: () => 100 },
    UrlFetchApp: { fetch: (u, o) => { fetches.push({ u, o }); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ choices: [{ message: { content: 'إجابة تجريبية' } }] }) }; } },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => { const c = { timeBased: () => c, atHour: () => c, everyDays: () => c, inTimezone: () => c, create: () => c }; return c; } },
    HtmlService: { XFrameOptionsMode: { DEFAULT: 'D' } }
  };
  vm.createContext(env);
  if (process.env.CODE_GS) vm.runInContext(fs.readFileSync(process.env.CODE_GS, 'utf8'), env, { filename: 'Code.gs' });
  else for (const f of ['Config', 'Db', 'Auth', 'Notify', 'Geo', 'Ai', 'Api', 'Setup']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f + '.gs'), 'utf8'), env, { filename: f + '.gs' });
  env.__props = props; env.__mails = mails; env.__sheets = sheets; env.__fetches = fetches; env.__cache = cache;
  env.__setActive = e => { activeEmail = e; };
  return env;
}
module.exports = { makeEnv };
