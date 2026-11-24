'use strict';
/** Outbound integrations: OTP delivery, AI providers (OpenAI-compatible, with fallback) and Odoo External API. Secrets only from env. */
const crypto = require('crypto');
const env = (k, d) => (process.env[k] == null || process.env[k] === '' ? d : process.env[k]);
const timeoutFetch = async (url, opts, ms) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 20000); try { return await fetch(url, Object.assign({}, opts, { signal: c.signal })); } finally { clearTimeout(t); } };

// ---------- OTP delivery ----------
// OTP_PROVIDER = console (development only) | webhook | twilio | unifonic
let SMTP = null;
function otpChannels() { const p = env('OTP_PROVIDER', 'console'); const prod = env('NODE_ENV') === 'production'; const dev = p === 'console' && !prod; return { sms: dev || ['twilio', 'unifonic', 'webhook'].includes(p), email: dev || p === 'webhook' || !!env('SMTP_HOST') }; }
async function sendOtp(channel, to, code) {
  const p = env('OTP_PROVIDER', 'console');
  const text = 'رمز الدخول إلى ميدان: ' + code + ' — صالح 5 دقائق. لا تشاركه مع أحد.';
  if (channel === 'email' && env('SMTP_HOST')) { // e.g. Gmail / Google Workspace: smtp.gmail.com:465 with an app password
    if (!SMTP) SMTP = require('nodemailer').createTransport({ host: env('SMTP_HOST'), port: +env('SMTP_PORT', '465'), secure: env('SMTP_PORT', '465') === '465', auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') }, connectionTimeout: 10000 });
    await SMTP.sendMail({ from: env('SMTP_FROM') || env('SMTP_USER'), to, subject: 'رمز الدخول إلى ميدان', text, html: '<div dir="rtl" style="font-family:Tahoma,Arial;font-size:16px">رمز الدخول إلى ميدان:<br><b style="font-size:28px;letter-spacing:4px">' + code + '</b><br>صالح 5 دقائق. لا تشاركه مع أحد.</div>' }); return {};
  }
  if (p === 'console') { if (env('NODE_ENV') === 'production') throw new Error('OTP_PROVIDER=console is not allowed in production'); return { dev: true }; }
  if (p === 'webhook') {
    const url = env('OTP_WEBHOOK_URL'); const secret = env('OTP_WEBHOOK_SECRET'); if (!url || !/^https:\/\//.test(url) || !secret) throw new Error('OTP webhook not configured');
    const body = JSON.stringify({ channel, to, text, code, ts: Date.now() }); const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const r = await timeoutFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Maydan-Signature': sig }, body }); if (!r.ok) throw new Error('webhook ' + r.status); return {};
  }
  if (channel !== 'sms') throw new Error('email OTP needs OTP_PROVIDER=webhook');
  if (p === 'twilio') {
    const sid = env('TWILIO_ACCOUNT_SID'), tok = env('TWILIO_AUTH_TOKEN'), from = env('TWILIO_FROM'); if (!sid || !tok || !from) throw new Error('Twilio not configured');
    const r = await timeoutFetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Messages.json', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ To: '+' + to, From: from, Body: text }).toString() });
    if (!r.ok) throw new Error('twilio ' + r.status); return {};
  }
  if (p === 'unifonic') {
    const app = env('UNIFONIC_APPSID'), sender = env('UNIFONIC_SENDER'); if (!app || !sender) throw new Error('Unifonic not configured');
    const r = await timeoutFetch('https://el.cloud.unifonic.com/rest/SMS/messages', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ AppSid: app, SenderID: sender, Recipient: to, Body: text }).toString() });
    if (!r.ok) throw new Error('unifonic ' + r.status); return {};
  }
  throw new Error('unknown OTP_PROVIDER');
}

// ---------- AI providers (all OpenAI-compatible chat/completions) ----------
const AI_DEFS = [
  ['OMNIROUTE', 'OmniRoute', () => (env('OMNIROUTE_URL', '').replace(/\/$/, '') + '/v1')],
  ['NINEROUTER', '9Router', () => (env('NINEROUTER_URL', '').replace(/\/$/, '') + '/v1')],
  ['OPENAI', 'OpenAI', () => 'https://api.openai.com/v1'],
  ['GROQ', 'Groq', () => 'https://api.groq.com/openai/v1'],
  ['OPENROUTER', 'OpenRouter', () => 'https://openrouter.ai/api/v1'],
  ['DEEPSEEK', 'DeepSeek', () => 'https://api.deepseek.com/v1'],
  ['GEMINI', 'Gemini', () => 'https://generativelanguage.googleapis.com/v1beta/openai']
];
function aiProviders() {
  const order = env('AI_ORDER', 'OMNIROUTE,NINEROUTER,OPENAI,GROQ,OPENROUTER,DEEPSEEK,GEMINI').split(',').map((x) => x.trim().toUpperCase());
  return AI_DEFS.filter(([k]) => env(k + '_MODEL') && (k === 'NINEROUTER' ? env('NINEROUTER_URL') : k === 'OMNIROUTE' ? env('OMNIROUTE_URL') : env(k + '_API_KEY'))).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([k, name, base]) => ({ k, name, base: base(), model: env(k + '_MODEL'), key: env(k + '_API_KEY', '') }));
}
async function aiChat(messages) {
  for (const p of aiProviders()) {
    try {
      const headers = { 'Content-Type': 'application/json' }; if (p.key) headers.Authorization = 'Bearer ' + p.key; if (p.k === 'OPENROUTER') headers['X-Title'] = 'Maydan';
      const r = await timeoutFetch(p.base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify({ model: p.model, messages, temperature: 0.2 }) }, 60000);
      if (!r.ok) continue; const j = await r.json(); const t = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (t) return { text: String(t).slice(0, 12000), via: p.name + ' · ' + p.model };
    } catch (e) { /* try next provider */ }
  }
  return null;
}

// ---------- Odoo External API (JSON-RPC) ----------
const odooOn = () => !!(env('ODOO_URL') && env('ODOO_DB') && env('ODOO_USER') && env('ODOO_API_KEY'));
async function odooCall(service, method, args) {
  const url = env('ODOO_URL').replace(/\/$/, '') + '/jsonrpc'; if (!/^https:\/\//.test(url)) throw new Error('ODOO_URL must be https');
  const r = await timeoutFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }) }, 30000);
  const j = await r.json(); if (j.error) throw new Error((j.error.data && j.error.data.message) || j.error.message || 'odoo error'); return j.result;
}
async function odooEmployees() {
  if (!odooOn()) throw new Error('Odoo is not configured');
  const db = env('ODOO_DB'), key = env('ODOO_API_KEY');
  const uid = await odooCall('common', 'authenticate', [db, env('ODOO_USER'), key, {}]); if (!uid) throw new Error('Odoo authentication failed');
  const fields = ['name', 'identification_id', 'job_id', 'job_title', 'department_id', 'parent_id', 'work_email', 'mobile_phone', 'work_phone'];
  const recs = await odooCall('object', 'execute_kw', [db, uid, key, 'hr.employee', 'search_read', [[['active', '=', true]]], { fields, limit: 5000 }]);
  const m2o = (v) => (Array.isArray(v) ? v[1] : v || '');
  return recs.map((e) => ['odoo:' + e.id, e.name || '', e.identification_id || '', m2o(e.job_id) || e.job_title || '', m2o(e.department_id), m2o(e.parent_id), e.work_email || '', e.mobile_phone || '', e.work_phone || '']);
}

module.exports = { sendOtp, aiChat, aiProviders, odooOn, odooEmployees, otpChannels };

// ---------- company system / ERP webhook: every data update is POSTed, signed with HMAC-SHA256 (header X-Maydan-Signature: sha256=<hex>) ----------
const ERP_Q = { busy: false, next: null };
module.exports.pushErp = function pushErp(payload) {
  const url = process.env.ERP_WEBHOOK_URL; if (!url || !/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])/.test(url)) return;
  ERP_Q.next = payload; if (ERP_Q.busy) return; // coalesce bursts: only the latest state is sent
  ERP_Q.busy = true;
  (async () => { while (ERP_Q.next) { const p = ERP_Q.next; ERP_Q.next = null; const body = JSON.stringify(p);
    const sig = require('crypto').createHmac('sha256', process.env.ERP_WEBHOOK_SECRET || '').update(body).digest('hex');
    try { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Maydan-Event': p.event, 'X-Maydan-Signature': 'sha256=' + sig }, body, signal: AbortSignal.timeout(10000) }); if (!r.ok) console.error('erp webhook', r.status); } catch (e) { console.error('erp webhook failed', e.message); } }
    ERP_Q.busy = false; })();
};
