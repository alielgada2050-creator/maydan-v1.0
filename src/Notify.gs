/**
 * الإشعارات: داخل المنصة + البريد (Gmail) + تيليجرام (اختياري) + SMS عبر Twilio (اختياري).
 * واتساب: روابط محادثة مباشرة من الواجهة (wa.me). ربط WhatsApp Cloud API ممكن لاحقاً.
 */

function notify_(users, title, body, refId) {
  var seen = {};
  users.forEach(function (u) {
    if (!u || seen[u.id]) return;
    seen[u.id] = true;
    var channels = ['app'];
    try {
      if (u.email && MailApp.getRemainingDailyQuota() > 5) {
        MailApp.sendEmail({ to: u.email, subject: 'ميدان — ' + title, htmlBody: '<div dir="rtl" style="font-family:Tahoma,Arial;font-size:15px;line-height:1.8">' + escHtml_(body).replace(/\n/g, '<br>') + '</div>', name: MAYDAN.APP_NAME });
        channels.push('email');
      }
    } catch (e) { console.error('mail', e); }
    if (u.telegramChatId && sendTelegram_(u.telegramChatId, '🔔 ' + title + '\n' + body)) channels.push('telegram');
    insert_('Notifications', { id: newId_('NTF'), at: now_(), toUserId: u.id, title: title, body: body, channel: channels.join(','), status: 'new', refId: refId || '' });
  });
}

function notifyRoles_(roles, title, body, refId, extraUsers) {
  var users = readAll_('Users').filter(function (u) { return u.active !== 'false' && roles.indexOf(u.role) >= 0; });
  notify_(users.concat(extraUsers || []), title, body, refId);
}

function escHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}

function sendTelegram_(chatId, text) {
  var token = prop_('TELEGRAM_BOT_TOKEN');
  if (!token || !chatId) return false;
  try {
    var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ chat_id: String(chatId), text: String(text).slice(0, 3500) })
    });
    return r.getResponseCode() === 200;
  } catch (e) { return false; }
}

function sendSms_(phone, text) {
  var sid = prop_('TWILIO_SID'), tok = prop_('TWILIO_TOKEN'), from = prop_('TWILIO_FROM');
  if (!sid || !tok || !from) return false;
  try {
    var r = UrlFetchApp.fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json', {
      method: 'post', muteHttpExceptions: true,
      headers: { Authorization: 'Basic ' + Utilities.base64Encode(sid + ':' + tok) },
      payload: { To: '+' + String(phone).replace(/\D/g, ''), From: from, Body: text }
    });
    return r.getResponseCode() < 300;
  } catch (e) { return false; }
}
