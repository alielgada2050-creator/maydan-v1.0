/**
 * طبقة البيانات فوق Google Sheets.
 * كل دالة هنا تنتهي بـ "_" فلا يمكن استدعاؤها من المتصفح عبر google.script.run.
 */
var DB_CACHE_ = {};

function ss_() {
  var id = prop_('SPREADSHEET_ID');
  if (!id) throw new Error('لم يتم الإعداد بعد: شغّل الدالة setup من محرر Apps Script.');
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  if (!SCHEMA[name]) throw new Error('جدول غير معروف: ' + name);
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('الجدول غير موجود: ' + name);
  return sh;
}

function readAll_(name) {
  if (DB_CACHE_[name]) return DB_CACHE_[name];
  var sh = sheet_(name);
  var cols = SCHEMA[name];
  var last = sh.getLastRow();
  var rows = last > 1 ? sh.getRange(2, 1, last - 1, cols.length).getValues() : [];
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === '' || rows[i][0] === null) continue;
    var o = { _row: i + 2 };
    for (var c = 0; c < cols.length; c++) o[cols[c]] = rows[i][c] === null ? '' : String(rows[i][c]);
    out.push(o);
  }
  DB_CACHE_[name] = out;
  return out;
}

function clearCache_(name) { delete DB_CACHE_[name]; }

function findById_(name, id) {
  var all = readAll_(name);
  for (var i = 0; i < all.length; i++) if (all[i].id === String(id)) return all[i];
  return null;
}

/** يمنع حقن الصيغ في Sheets: أي قيمة تبدأ بـ = + - @ تُخزَّن كنص */
function safeCell_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) return "'" + s;
  return s;
}

function toRow_(name, obj) {
  return SCHEMA[name].map(function (c) { return safeCell_(obj[c]); });
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function newId_(prefix) {
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
}

function now_() {
  return Utilities.formatDate(new Date(), 'Asia/Riyadh', "yyyy-MM-dd'T'HH:mm:ss");
}

function insert_(name, obj) {
  return withLock_(function () {
    var sh = sheet_(name);
    sh.appendRow(toRow_(name, obj));
    clearCache_(name);
    return obj;
  });
}

function update_(name, id, patch) {
  return withLock_(function () {
    clearCache_(name);
    var row = findById_(name, id);
    if (!row) throw new Error('السجل غير موجود');
    var merged = {};
    SCHEMA[name].forEach(function (c) { merged[c] = (patch[c] !== undefined) ? patch[c] : row[c]; });
    sheet_(name).getRange(row._row, 1, 1, SCHEMA[name].length).setValues([toRow_(name, merged)]);
    clearCache_(name);
    return merged;
  });
}

function remove_(name, id) {
  return withLock_(function () {
    clearCache_(name);
    var row = findById_(name, id);
    if (!row) return false;
    sheet_(name).deleteRow(row._row);
    clearCache_(name);
    return true;
  });
}

function strip_(o) {
  if (!o) return o;
  var c = {};
  for (var k in o) if (k !== '_row') c[k] = o[k];
  return c;
}

function audit_(user, action, entity, entityId, details) {
  try {
    var sh = sheet_('Audit');
    sh.appendRow(toRow_('Audit', {
      at: now_(),
      userId: user ? user.id : '',
      userName: user ? user.name : '',
      action: action, entity: entity || '', entityId: entityId || '',
      details: typeof details === 'string' ? details : JSON.stringify(details || {}).slice(0, 1000)
    }));
  } catch (e) { console.error('audit failed', e); }
}
