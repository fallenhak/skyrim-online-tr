
// ---------------------------------------------------------------------------
// RP: oyuncu kimliği (#1234) ve yakınlık sohbeti (/me /do /ooc /b /f /s /zar)
// ---------------------------------------------------------------------------

// Her karaktere kalıcı, benzersiz 4 haneli kimlik; ileride tanışma sistemi bunu kullanacak.
const PID_FILE = process.cwd() + '/sotr-pids.json';
let pids = {};
try { pids = JSON.parse(fs.readFileSync(PID_FILE, 'utf8')); } catch (e) { /* ilk açılış */ }
const savePids = () => {
  try { fs.writeFileSync(PID_FILE, JSON.stringify(pids)); } catch (e) { console.log('[sotr-rp] kimlik kaydı yazılamadı', e && e.message); }
};
const pidOf = (actor) => {
  const key = actor.toString(16);
  if (pids[key]) return pids[key];
  const used = new Set(Object.values(pids));
  let pid;
  do { pid = 1000 + Math.floor(Math.random() * 9000); } while (used.has(pid));
  pids[key] = pid;
  savePids();
  console.log(`[sotr-rp] kimlik verildi: ${actorName(actor)} (${key}) → #${pid}`);
  return pid;
};
const tagOf = (actor) => `#${pidOf(actor)}`;
const chatName = (actor) => `${tagOf(actor)} ${actorName(actor)}`;

const welcomed = new Set();
every(2000, () => {
  for (const actor of onlinePlayers()) {
    if (!welcomed.has(actor)) {
      welcomed.add(actor);
      setTimeout(() => {
        deliver(actor, 'sys', `Skyrim Online TR'ye hoş geldin, ${tagOf(actor)}! Sohbet: Enter · Sesli: V (bas-konuş), B (fısıltı/normal/bağırma) · Beceri puanları: K · Komutlar: /yardim`);
      }, 8000);
    }
    const want = `${tagOf(actor)}  ${actorName(actor)}`;
    try { if (mp.get(actor, 'sotrTag') !== want) mp.set(actor, 'sotrTag', want); } catch (e) { /* yoksay */ }
  }
});

// Menziller (Skyrim birimi; 1 m ≈ 70 birim)
const RANGE = { whisper: 250, say: 1500, shout: 4000 };
const COLORS = { say: '#f2eadb', whisper: '#b9c7d6', shout: '#ffd27a', me: '#d6a8ff', do: '#9fd8a6', ooc: '#9aa6b2', looc: '#8fb1c9', roll: '#ffb36b', sys: '#e6c77f' };

const posOf = (id) => { try { return mp.get(id, 'pos'); } catch (e) { return null; } };
const cellOf = (id) => { try { return `${mp.get(id, 'worldOrCellDesc')}`; } catch (e) { return ''; } };
const near = (a, b, range) => {
  if (a === b) return true;
  const pa = posOf(a); const pb = posOf(b);
  if (!pa || !pb || cellOf(a) !== cellOf(b)) return false;
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) <= range;
};

const CHAT_LOG = process.cwd() + '/sotr-chat.log';
let chatSeq = 0;
const chatBox = new Map(); // actor → son mesajlar
const deliver = (actor, kind, text) => {
  const list = chatBox.get(actor) || [];
  list.push({ id: ++chatSeq, c: COLORS[kind] || COLORS.say, t: text });
  while (list.length > 30) list.shift();
  chatBox.set(actor, list);
  try { mp.set(actor, 'sotrChat', { seq: chatSeq, msgs: list }); } catch (e) { /* yoksay */ }
};
const broadcast = (from, kind, text, range) => {
  for (const p of onlinePlayers()) {
    if (range === Infinity || near(from, p, range)) deliver(p, kind, text);
  }
  console.log(`[sotr-chat] ${text}`);
  try { fs.appendFileSync(CHAT_LOG, `${new Date().toISOString()} ${from.toString(16)} ${text}
`); } catch (e) { /* yoksay */ }
};

// Emote: [animasyon olayı, /me metni]
const EMOTES = {
  selam: ['IdleWave', 'el sallar.'],
  alkis: ['IdleApplaud2', 'alkışlar.'],
  gul: ['IdleLaugh', 'kahkaha atar.'],
  selamdur: ['IdleSalute', 'selam durur.'],
  dua: ['IdlePray', 'dua eder.'],
  gergin: ['IdleNervous', 'gergin görünür.'],
  otur: ['IdleSitCrossLeggedEnter', 'yere bağdaş kurup oturur.'],
  ter: ['IdleWipeBrow', 'alnının terini siler.'],
  incele: ['IdleStudy', 'etrafı dikkatle inceler.'],
  dur: ['IdleForceDefaultState', ''],
};
const HELP = 'Komutlar: yazı = konuş · /f fısılda · /s bağır · /me eylem · /do ortam · /b yerel OOC · /ooc genel OOC · /zar [yüz sayısı] · /e emote (/e selam, /e otur, /e dur) · Ses: V bas-konuş, B mod';

const onChat = (actor, raw) => {
  const text = `${raw || ''}`.replace(/[<>]/g, '').trim().slice(0, 300);
  if (!text) return;
  const m = /^\/(\S+)\s*(.*)$/.exec(text);
  const cmd = m ? m[1].toLowerCase() : '';
  const rest = m ? m[2].trim() : text;
  const who = chatName(actor);
  if (!m) return broadcast(actor, 'say', `${who}: ${rest}`, RANGE.say);
  switch (cmd) {
    case 'f': case 'fisilda': case 'fısılda': case 'w':
      if (rest) broadcast(actor, 'whisper', `${who} fısıldar: ${rest}`, RANGE.whisper);
      return;
    case 's': case 'bagir': case 'bağır': case 'shout':
      if (rest) broadcast(actor, 'shout', `${who} bağırır: ${rest.toLocaleUpperCase('tr')}!`, RANGE.shout);
      return;
    case 'me':
      if (rest) broadcast(actor, 'me', `* ${who} ${rest}`, RANGE.say);
      return;
    case 'do':
      if (rest) broadcast(actor, 'do', `* ${rest} (( ${tagOf(actor)} ))`, RANGE.say);
      return;
    case 'b': case 'looc':
      if (rest) broadcast(actor, 'looc', `(( ${who}: ${rest} ))`, RANGE.say);
      return;
    case 'ooc': case 'o':
      if (rest) broadcast(actor, 'ooc', `[OOC] ${who}: ${rest}`, Infinity);
      return;
    case 'zar': case 'roll': {
      const sides = Math.max(2, Math.min(1000, parseInt(rest, 10) || 20));
      const r = 1 + Math.floor(Math.random() * sides);
      broadcast(actor, 'roll', `🎲 ${who} zar attı (1-${sides}): ${r}`, RANGE.say);
      return;
    }
    case 'e': case 'emote': {
      const em = EMOTES[rest.toLowerCase()];
      if (!em) { deliver(actor, 'sys', 'Emote listesi: ' + Object.keys(EMOTES).join(', ') + ' (örnek: /e selam)'); return; }
      try { mp.set(actor, 'sotrEmote', { seq: ++chatSeq, anim: em[0] }); } catch (e) { /* yoksay */ }
      if (em[1]) broadcast(actor, 'me', `* ${who} ${em[1]}`, RANGE.say);
      return;
    }
    default:
      deliver(actor, 'sys', HELP);
  }
};
mp._onSotrChat = (actor, e) => {
  if (e && typeof e.perf === 'string') { console.log(`[sotr-perf] ${actor.toString(16)} ${e.perf.slice(0, 600)}`); return; }
  try { onChat(actor, e && e.text); } catch (err) { console.log('[sotr-chat] hata', err && err.message); }
};

// --- İstemci tarafı --------------------------------------------------------

/* eslint-disable no-var */
// Ölçüm: panel açıkken kare hızı, uzun işler, tıklama→çizim ve oyun→tarayıcı gecikmesi.
// Her 5 sn'de bir sotrPerf mesajı; sunucu logunda [sotr-perf].
function sotrPerfProbe() {
  if (window.sotrPerf) return;
  var P = window.sotrPerf = { frames: 0, long: 0, longMs: 0, clicks: [], marks: [], since: Date.now() };
  var visible = function () {
    var ids = ['sotr-admin', 'sotr-skills'];
    for (var i = 0; i < ids.length; i++) { var el = document.getElementById(ids[i]); if (el && el.style.display !== 'none') return ids[i]; }
    var c = document.getElementById('sotr-chat');
    return c && c.classList.contains('open') ? 'sotr-chat' : '';
  };
  var loop = function () { P.frames++; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  try {
    new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { P.long++; P.longMs += e.duration; }); }).observe({ entryTypes: ['longtask'] });
  } catch (e) { P.noLongtask = true; }
  document.addEventListener('mousedown', function () {
    var t0 = performance.now();
    requestAnimationFrame(function () { requestAnimationFrame(function () { P.clicks.push(Math.round(performance.now() - t0)); }); });
  }, true);
  window.sotrPerfMark = function (what, sentAt) {
    var t0 = Date.now();
    requestAnimationFrame(function () { P.marks.push(what + ':' + (t0 - sentAt) + '+' + (Date.now() - t0)); });
  };
  setInterval(function () {
    var dt = (Date.now() - P.since) / 1000;
    var panel = visible();
    if (panel || P.marks.length) {
      window.skyrimPlatform.sendMessage('sotrPerf', JSON.stringify({
        panel: panel, fps: Math.round(P.frames / dt), long: P.long, longMs: Math.round(P.longMs), clicks: P.clicks, marks: P.marks,
        w: innerWidth, h: innerHeight, nodes: document.getElementsByTagName('*').length, noLT: !!P.noLongtask,
      }));
    }
    P.frames = 0; P.long = 0; P.longMs = 0; P.clicks = []; P.marks = []; P.since = Date.now();
  }, 5000);
}

function sotrChatPanel() {
  if (document.getElementById('sotr-chat')) return;
  var css = ''
    + '#sotr-chat{position:fixed;left:24px;bottom:120px;width:520px;z-index:99990;font:15px "Segoe UI",sans-serif;pointer-events:none}'
    + '#sotr-chat .log{max-height:260px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end}'
    + '#sotr-chat .m{padding:2px 8px;text-shadow:0 0 3px #000,0 0 6px #000;transition:opacity 1s;word-wrap:break-word}'
    + '#sotr-chat .m.old{opacity:0}#sotr-chat.open .m.old{opacity:1}'
    + '#sotr-chat.open .log{background:rgba(10,8,6,.55);border-radius:6px 6px 0 0;overflow:auto;pointer-events:auto}'
    + '#sotr-chat input{display:none;width:100%;box-sizing:border-box;font:inherit;color:#fff;background:rgba(15,12,9,.9);border:1px solid #9c8352;border-radius:0 0 6px 6px;padding:7px 9px;outline:none}'
    + '#sotr-chat.open input{display:block;pointer-events:auto}'
    + '#sotr-chat .hint{display:none;font-size:11px;color:#bba;padding:3px 8px;text-shadow:0 0 3px #000}#sotr-chat.open .hint{display:block}';
  var root = document.createElement('div');
  root.id = 'sotr-chat';
  root.innerHTML = '<style>' + css + '</style><div class="log"></div><input maxlength="300" placeholder="Yaz… (/yardim)">'
    + '<div class="hint">Enter gönder · Esc kapat · /f fısıltı · /s bağır · /me · /do · /b · /ooc · /zar</div>';
  document.body.appendChild(root);
  var log = root.querySelector('.log');
  var input = root.querySelector('input');
  var lastId = 0;
  var history = [];
  var hIdx = 0;
  var close = function () {
    root.classList.remove('open');
    input.value = '';
    input.blur();
    window.skyrimPlatform.sendMessage('sotrChatClose');
  };
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var t = input.value.trim();
      if (t) { window.skyrimPlatform.sendMessage('sotrChatSend', t); history.push(t); hIdx = history.length; }
      close();
    } else if (e.key === 'Escape') {
      close();
    } else if (e.key === 'ArrowUp' && hIdx > 0) {
      input.value = history[--hIdx];
    } else if (e.key === 'ArrowDown' && hIdx < history.length) {
      input.value = history[++hIdx] || '';
    }
  });
  window.sotrChatOpen = function () {
    root.classList.add('open');
    log.scrollTop = log.scrollHeight;
    setTimeout(function () { input.focus(); }, 30);
  };
  window.sotrChatRecv = function (d) {
    (d.msgs || []).forEach(function (m) {
      if (m.id <= lastId) return;
      lastId = m.id;
      var el = document.createElement('div');
      el.className = 'm';
      el.style.color = m.c;
      el.textContent = m.t;
      log.appendChild(el);
      setTimeout(function () { el.classList.add('old'); }, 12000);
    });
    while (log.children.length > 80) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  };
}

function sotrChatClient(ctx, cfg) {
  if (ctx.state.sotrChatInit) return;
  ctx.state.sotrChatInit = true;
  const sp = ctx.sp;
  const ENTER = 0x1c;
  let wasDown = false;
  let open = false;
  const inject = () => sp.browser.executeJavaScript('(' + cfg.panelSrc + ')()');

  sp.on('update', () => {
    const down = sp.Input.isKeyPressed(ENTER);
    if (down && !wasDown && !open && !sp.browser.isFocused() && !sp.Utility.isInMenuMode()) {
      open = true;
      sp.browser.setVisible(true);
      sp.browser.executeJavaScript('window.sotrPerfMark && window.sotrPerfMark("chat",' + Date.now() + ')');
      inject();
      sp.browser.setFocused(true);
      sp.browser.executeJavaScript('window.sotrChatOpen && window.sotrChatOpen()');
    }
    wasDown = down;
  });
  sp.on('browserMessage', (e) => {
    if (e.arguments[0] === 'sotrChatSend') ctx.sendEvent({ text: '' + e.arguments[1] });
    else if (e.arguments[0] === 'sotrChatClose' && open) { open = false; sp.browser.setFocused(false); }
    else if (e.arguments[0] === 'sotrPerf') ctx.sendEvent({ perf: '' + e.arguments[1] });
  });
  sp.browser.setVisible(true);
  inject();
  sp.browser.executeJavaScript('(' + cfg.probeSrc + ')()');
}
