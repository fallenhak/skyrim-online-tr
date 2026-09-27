
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

every(2000, () => {
  for (const actor of onlinePlayers()) {
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
};

const HELP = 'Komutlar: yazı = konuş · /f fısılda · /s bağır · /me eylem · /do ortam · /b yerel OOC · /ooc genel OOC · /zar [yüz sayısı]';

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
    default:
      deliver(actor, 'sys', HELP);
  }
};
mp._onSotrChat = (actor, e) => {
  try { onChat(actor, e && e.text); } catch (err) { console.log('[sotr-chat] hata', err && err.message); }
};

// --- İstemci tarafı --------------------------------------------------------

/* eslint-disable no-var */
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
      inject();
      sp.browser.setFocused(true);
      sp.browser.executeJavaScript('window.sotrChatOpen && window.sotrChatOpen()');
    }
    wasDown = down;
  });
  sp.on('browserMessage', (e) => {
    if (e.arguments[0] === 'sotrChatSend') ctx.sendEvent({ text: '' + e.arguments[1] });
    else if (e.arguments[0] === 'sotrChatClose' && open) { open = false; sp.browser.setFocused(false); }
  });
  sp.browser.setVisible(true);
  inject();
}
