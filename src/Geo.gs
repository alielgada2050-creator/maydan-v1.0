/**
 * التحقق المكاني والتنسيق بين الفرق.
 */

function haversineKm_(lat1, lng1, lat2, lng2) {
  var R = 6371, toR = Math.PI / 180;
  var dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** جاهزية الفرقة: لا تعمل الفرقة دون معدة عاملة بسائق */
function crewReadiness_(crew, equipment) {
  var eq = equipment.filter(function (e) { return e.crewId === crew.id; });
  var working = eq.filter(function (e) { return e.status !== 'shop' && e.status !== 'out' && e.driverId && (e.ownerId === '' || crew.type !== 'excav'); });
  var hasSup = !!crew.supervisorId;
  if (!hasSup) return { state: 'stopped', reason: 'لا يوجد مراقب للفرقة' };
  if (working.length === 0) return { state: 'stopped', reason: 'لا توجد معدة عاملة بسائق — فرقة بلا معدة لا تعمل' };
  var warn = eq.filter(function (e) {
    return e.status === 'due' || Number(e.oilRemainKm || 99999) <= MAYDAN.OIL_WARN_KM || (e.inspExpiry && e.inspExpiry < today_());
  }).length;
  return warn ? { state: 'warn', reason: warn + ' تنبيه صيانة أو زيت أو فحص' } : { state: 'ready', reason: 'جاهزة' };
}

function today_() { return Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd'); }

/** يبحث عن فرق من النوع المطلوب قريبة من نقطة، مرتبة بالمسافة */
function findNearby_(lat, lng, neededType, radiusKm, excludeCrewId) {
  var eq = readAll_('Equipment');
  return readAll_('Crews').filter(function (c) {
    return c.active !== 'false' && c.id !== excludeCrewId && c.type === neededType && c.lat !== '' && c.lng !== '';
  }).map(function (c) {
    var d = haversineKm_(Number(lat), Number(lng), Number(c.lat), Number(c.lng));
    var r = crewReadiness_(c, eq);
    return { crewId: c.id, name: c.name, km: Math.round(d * 10) / 10, readiness: r.state, locAt: c.locAt };
  }).filter(function (x) { return x.readiness !== 'stopped'; })
    .sort(function (a, b) { return a.km - b.km; })
    .map(function (x) { x.inRadius = x.km <= radiusKm; return x; })
    .slice(0, 5);
}
