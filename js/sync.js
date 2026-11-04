/* Water Log – sync: talking to the sheet, the offline queue, and the one-off setup screen */
'use strict';

/* ================= API & sync ================= */

async function api(action, body) {
  if (!S.cfg || !S.cfg.url) throw new Error('not set up');
  let res;
  if (action === 'data' || action === 'photo') {
    res = await fetch(S.cfg.url + '?action=' + action + '&key=' + enc(S.cfg.key), { cache: 'no-store' });
  } else {
    res = await fetch(S.cfg.url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action, key: S.cfg.key }, body))
    });
  }
  if (!res.ok) throw new Error('Server replied ' + res.status);
  const j = await res.json();
  if (j && j.ok === false) { const e = new Error(j.error || 'Server error'); e.server = true; throw e; }
  return j;
}

async function refresh(quiet) {
  if (!S.cfg) return;
  try {
    const d = await api('data');
    S.data = d; store.set(LS.data, d); S.lastError = '';
    if (!quiet) toast('Up to date');
  } catch (e) {
    S.lastError = e.server ? e.message : '';
    if (!quiet) toast(e.server ? e.message : 'No signal – showing saved copy');
    return false;
  }
  // don't redraw a form you're typing into
  if (/^#(addc?|edit|place)\b/.test(location.hash)) updateDot(); else render();
  return true;
}

// Buttons that say what they are doing, then leave the result on the page
const hhmm = () => new Date().toTimeString().slice(0, 5);
window.refreshNow = async function (btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Checking your sheet…'; }
  const ok = await refresh(true);
  S.status = ok ? `Up to date at ${hhmm()} – ${S.data.entries.length} trips, ${(S.data.photos || []).length} photos`
    : S.lastError ? 'Your sheet replied: ' + S.lastError : "Couldn't reach your sheet – check your signal and try again";
  render();
};
window.sendNow = async function (btn) {
  const n = S.queue.length;
  if (!n) { S.status = 'Nothing waiting to send'; render(); return; }
  if (btn) { btn.disabled = true; btn.textContent = `Sending ${n} ${n === 1 ? 'change' : 'changes'}…`; }
  for (let i = 0; S.syncing && i < 120; i++) await new Promise(r => setTimeout(r, 500)); // a send already under way
  await flush();
  const err = S.queue.find(q => q.error);
  S.status = !S.queue.length ? `All sent at ${hhmm()}`
    : err ? 'Not sent – your sheet replied: ' + err.error + '. Tap Discard to drop it.'
    : `${S.queue.length} still waiting – couldn't reach your sheet. It will try again when you have signal.`;
  render();
};

function saveQueue() { store.set(LS.queue, S.queue); updateDot(); }

async function flush() {
  if (S.syncing || !S.queue.length || !S.cfg) return;
  S.syncing = true;
  let sent = 0;
  try {
    while (S.queue.length) {
      const q = S.queue[0];
      try {
        if (q.kind === 'add') await api('add', { paddle: q.paddle });
        else if (q.kind === 'update') await api('update', { row: q.row, expect: q.expect, paddle: q.paddle });
        else if (q.kind === 'place') await api('place', { name: q.name, fields: q.fields });
        else if (q.kind === 'candidate') await api('candidate', { id: q.id, status: q.status });
        else if (q.kind === 'photo') await api('addphoto', { trip: q.trip, photo: q.photo, uid: q.uid });
        else if (q.kind === 'delete') await api('delete', { row: q.row, expect: q.expect, uid: q.uid });
        else if (q.kind === 'delphoto') await api('deletephoto', { id: q.id, uid: q.uid });
        else if (q.kind === 'movephoto') await api('movephoto', { id: q.id, lat: q.lat, lon: q.lon, uid: q.uid });
        S.queue.shift(); sent++; saveQueue();
      } catch (e) {
        if (e.server && (q.kind === 'update' || q.kind === 'delete') && /moved/i.test(e.message) && !q.relocated && await relocate(q)) continue;
        if (e.server) { q.error = e.message; saveQueue(); toast('Not saved: ' + e.message); }
        break; // no signal (or a problem) – try again later
      }
    }
  } finally { S.syncing = false; }
  if (sent) { toast(sent === 1 ? 'Sent to your log' : sent + ' changes sent to your log'); await refresh(true); }
}

// The sheet was rearranged on the PC since the phone last loaded it: find the trip again by its date and river
async function relocate(q) {
  q.relocated = true;
  let d;
  try { d = await api('data'); } catch (e) { return false; }
  S.data = d; store.set(LS.data, d);
  const hits = (d.entries || []).filter(x => x.date === q.expect.date && x.river === q.expect.river);
  if (hits.length !== 1) return false;
  q.row = hits[0].row; delete q.error; saveQueue();
  return true;
}

function enqueue(item) {
  item.uid = item.uid || uid();
  if (item.paddle) item.paddle.uid = item.uid;
  S.queue.push(item); saveQueue();
  if (navigator.onLine) flush(); else toast('Saved on phone – will send when you have signal');
}

window.addEventListener('online', () => { flush(); refresh(true); });
window.flush = flush;

document.addEventListener('visibilitychange', () => { if (!document.hidden) { flush(); } });

/* ================= screens ================= */

function screenSetup(msg) {
  const c = S.cfg || {};
  return topbar('Set up', S.cfg ? 'home' : '') + `<div class="wrap form">
    ${msg ? `<div class="banner">${esc(msg)}</div>` : ''}
    <p class="muted">Connect Water Log to your Canoe Log Book. Paste the web app address and the App key
      from the Settings tab of the sheet. You only do this once on each phone.</p>
    <div class="btnrow"><button class="btn block" onclick="pasteSetup()">Paste setup link</button></div>
    <p class="muted">Copy the setup link from your messages first, then tap the button. Or fill in the two boxes below.</p>
    <label>Web app address</label><input id="su_url" value="${esc(c.url || '')}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="url">
    <label>App key</label><input id="su_key" value="${esc(c.key || '')}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
    <div class="btnrow"><button class="btn block" onclick="saveSetup()">Connect</button></div>
    ${S.cfg ? `<h2>On this phone</h2>
      <div class="card flat"><div class="kv">
        <dt>Paddles saved</dt><dd>${S.data ? S.data.entries.length : 0}</dd>
        <dt>Last updated</dt><dd>${S.data ? fmtDate(new Date(S.data.loadedAt)) + ' ' + new Date(S.data.loadedAt).toTimeString().slice(0, 5) : '–'}</dd>
        <dt>Waiting to send</dt><dd>${S.queue.length}</dd>
        <dt>App version</dt><dd>${APP_VERSION}</dd>
        <dt>Sheet script</dt><dd>${S.data && S.data.scriptVersion ? esc(S.data.scriptVersion) : 'Older than 4 Nov 2026'}${!S.data || !S.data.scriptVersion || S.data.scriptVersion < NEED_SCRIPT ? `<br><span class="badge warn">Update needed: deploy the latest Code.gs (${NEED_SCRIPT})</span>` : ''}</dd></div>
        <div class="btnrow"><button class="btn small ghost" onclick="refreshNow(this)">${ICON.refresh} Refresh now</button>
        ${S.queue.length ? '<button class="btn small" onclick="sendNow(this)">Send now</button>' : ''}</div>
        ${S.status ? `<p class="status">${esc(S.status)}</p>` : ''}</div>` : ''}
  </div>`;
}
window.pasteSetup = async function () {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch (e) { toast('Couldn\'t read the clipboard – paste into the address box instead'); return; }
  if (!/#setup=/.test(text || '')) { toast('That isn\'t the setup link – copy it again and retry'); return; }
  $('#su_url').value = text.trim(); $('#su_key').value = '';
  saveSetup();
};
window.saveSetup = async function () {
  let raw = $('#su_url').value.replace(/\s+/g, ''), key = $('#su_key').value.replace(/\s+/g, '');
  // a whole setup link pasted into the box also works
  const link = raw.match(/#setup=([^&]+)&key=(.+)$/);
  if (link) { raw = dec(link[1]); key = dec(link[2]); }
  const m = raw.match(/script\.google\.com\/macros\/s\/([\w-]+)\/exec/i);
  if (!m) { toast('That doesn\'t look like a web app address ending /exec'); return; }
  const url = 'https://script.google.com/macros/s/' + m[1] + '/exec';
  if (!key) { toast('Add the App key'); return; }
  S.cfg = { url, key }; store.set(LS.cfg, S.cfg);
  toast('Connecting…');
  try { const d = await api('data'); S.data = d; store.set(LS.data, d); toast('Connected – ' + d.entries.length + ' paddles'); go('home'); render(); }
  catch (e) { toast(e.server ? e.message : 'Could not reach the sheet – check the address and signal'); }
};
window.refresh = refresh;

