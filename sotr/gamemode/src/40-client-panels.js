
// ---------------------------------------------------------------------------
// Tarayıcı (CEF) panelleri: istemcide sp.browser.executeJavaScript ile çalışır.
// Bu fonksiyonlar sunucuda çalışmaz; kaynak metinleri istemciye gönderilir.
// ---------------------------------------------------------------------------

/* eslint-disable no-var */
function sotrAdminPanel(show) {
  var root = document.getElementById('sotr-admin');
  if (!show) { if (root) root.style.display = 'none'; return; }
  if (root) { root.style.display = 'flex'; return; }

  // Skyrim menü dili: siyah yarı saydam zemin, ince gri çizgiler, büyük harfli dar başlıklar; gradyan, gölge ve yuvarlak köşe yok
  var css = ''
    + '#sotr-admin{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:99999;background:rgba(0,0,0,.35);'
    + 'font:15px "Futura Condensed","Futura","Arial Narrow","Roboto Condensed",sans-serif;color:#d8d8d8}'
    + '#sotr-admin .win{width:860px;height:580px;display:flex;flex-direction:column;background:rgba(0,0,0,.86);border-top:1px solid rgba(255,255,255,.55);border-bottom:1px solid rgba(255,255,255,.55)}'
    + '#sotr-admin .top{display:flex;align-items:baseline;padding:16px 22px 12px;border-bottom:1px solid rgba(255,255,255,.18)}'
    + '#sotr-admin .top .t{font-size:22px;letter-spacing:3px;text-transform:uppercase;color:#fff}'
    + '#sotr-admin .top .x{margin-left:auto;cursor:pointer;color:#8a8a8a;font-size:13px;letter-spacing:2px;text-transform:uppercase}#sotr-admin .top .x:hover{color:#fff}'
    + '#sotr-admin .body{flex:1;display:flex;min-height:0}'
    + '#sotr-admin .nav{width:170px;border-right:1px solid rgba(255,255,255,.18);padding:10px 0}'
    + '#sotr-admin .nav div{padding:10px 22px;cursor:pointer;letter-spacing:2px;text-transform:uppercase;font-size:14px;color:#8a8a8a}'
    + '#sotr-admin .nav div:hover{color:#fff}#sotr-admin .nav div.on{color:#fff}#sotr-admin .nav div.on:before{content:"";display:inline-block;width:6px;height:6px;background:#fff;transform:rotate(45deg);margin:0 10px 2px -16px}'
    + '#sotr-admin .page{flex:1;padding:16px 22px;overflow:auto;display:none}#sotr-admin .page.on{display:block}'
    + '#sotr-admin .tabs{display:flex;flex-wrap:wrap;gap:4px 18px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.12)}'
    + '#sotr-admin .tab{cursor:pointer;letter-spacing:1.5px;text-transform:uppercase;font-size:13px;color:#8a8a8a}#sotr-admin .tab:hover,#sotr-admin .tab.on{color:#fff}'
    + '#sotr-admin .list div{padding:6px 10px;cursor:pointer;color:#bdbdbd;border-left:2px solid transparent}#sotr-admin .list div:hover{color:#fff;background:rgba(255,255,255,.06)}'
    + '#sotr-admin .list div.on{color:#fff;border-left-color:#fff;background:rgba(255,255,255,.08)}#sotr-admin .list small{color:#777;margin-left:8px}'
    + '#sotr-admin .split{display:flex;gap:20px;height:100%}#sotr-admin .split .l{flex:1;overflow:auto}#sotr-admin .split .r{width:290px;border-left:1px solid rgba(255,255,255,.18);padding-left:20px;overflow:auto}'
    + '#sotr-admin h3{margin:0 0 12px;font-weight:normal;font-size:20px;letter-spacing:2px;text-transform:uppercase;color:#fff}'
    + '#sotr-admin label{display:block;margin:14px 0 6px;font-size:12px;color:#8a8a8a;text-transform:uppercase;letter-spacing:2px}'
    + '#sotr-admin button{font:inherit;font-size:14px;letter-spacing:1.5px;text-transform:uppercase;color:#d8d8d8;background:transparent;border:1px solid rgba(255,255,255,.35);padding:7px 14px;cursor:pointer}'
    + '#sotr-admin button:hover{color:#fff;border-color:#fff;background:rgba(255,255,255,.08)}#sotr-admin button.wide{width:100%;margin-top:10px}'
    + '#sotr-admin button.s{font-size:12px;padding:3px 7px;letter-spacing:1px}#sotr-admin button.danger:hover{border-color:#c25b4a;color:#e08a7a}'
    + '#sotr-admin input,#sotr-admin textarea{font:inherit;color:#fff;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.25);padding:8px;box-sizing:border-box;outline:none}'
    + '#sotr-admin .step{display:flex;align-items:center;gap:10px}#sotr-admin .step span{min-width:28px;text-align:center;font-size:18px;color:#fff}'
    + '#sotr-admin table{width:100%;border-collapse:collapse}#sotr-admin td,#sotr-admin th{padding:7px 6px;border-bottom:1px solid rgba(255,255,255,.1);text-align:left;font-size:14px}'
    + '#sotr-admin th{color:#8a8a8a;font-weight:normal;font-size:12px;letter-spacing:2px;text-transform:uppercase}'
    + '#sotr-admin .acts{display:flex;flex-wrap:wrap;gap:4px}'
    + '#sotr-admin .stats{display:flex;gap:30px;margin-bottom:20px}#sotr-admin .stat{color:#8a8a8a;font-size:12px;letter-spacing:2px;text-transform:uppercase}#sotr-admin .stat b{display:block;font-size:30px;font-weight:normal;color:#fff;letter-spacing:0}'
    + '#sotr-admin .toast{position:absolute;bottom:40px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.9);border-top:1px solid rgba(255,255,255,.5);border-bottom:1px solid rgba(255,255,255,.5);padding:9px 24px;opacity:0;transition:opacity .3s;pointer-events:none}'
    + '#sotr-admin .hint{font-size:13px;color:#777;margin-top:10px}#sotr-admin .empty{color:#777;padding:30px 0;text-align:center}';

  root = document.createElement('div');
  root.id = 'sotr-admin';
  root.innerHTML = '<style>' + css + '</style>'
    + '<div class="win"><div class="top"><span class="t">Skyrim Online TR</span><span class="x">Close (F7)</span></div>'
    + '<div class="body"><div class="nav">'
    + '<div data-p="spawn" class="on">Creatures</div><div data-p="players">Players</div><div data-p="server">Server</div>'
    + '</div>'
    + '<div class="page on" id="sa-spawn"><div class="split"><div class="l">'
    + '<div class="tabs" id="sa-groups"></div><div class="list" id="sa-grid"><div class="empty">Loading...</div></div></div>'
    + '<div class="r" id="sa-detail"><div class="empty">Select a creature.</div></div></div></div>'
    + '<div class="page" id="sa-players"><div style="display:flex;align-items:center;margin-bottom:10px"><h3 style="margin:0">Online Players</h3><button class="s" id="sa-refresh" style="margin-left:auto">Refresh</button></div><div id="sa-ptable"></div></div>'
    + '<div class="page" id="sa-server"><div class="stats" id="sa-stats"></div>'
    + '<label>Announcement</label><textarea id="sa-ann" rows="3" style="width:100%" maxlength="200" placeholder="Shown on every player\'s screen"></textarea>'
    + '<button id="sa-ann-send" style="margin-top:10px">Announce</button>'
    + '<label style="margin-top:28px">Cleanup</label><button class="danger" id="sa-clear-all">Remove all spawned creatures</button></div>'
    + '</div></div><div class="toast" id="sa-toast"></div>';
  document.body.appendChild(root);

  var $ = function (s) { return root.querySelector(s); };
  var send = function (p) { window.skyrimPlatform.sendMessage('sotrAdmin', JSON.stringify(p)); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var S = { families: [], group: 'All', fam: null, role: 'any', tier: 'any', n: 1, variants: {}, showList: false, roleNames: {}, tierNames: {}, me: 0 };
  var toastTimer = 0;
  var armed = '';
  // CEF'te confirm() çalışmayabilir: tehlikeli işlemler ikinci tıkta onaylanır
  var sure = function (key, text) {
    if (armed === key) { armed = ''; return true; }
    armed = key;
    toast(text + ' Click again to confirm.');
    setTimeout(function () { if (armed === key) armed = ''; }, 4000);
    return false;
  };
  var toast = function (t) { var el = $('#sa-toast'); el.textContent = t; el.style.opacity = 1; clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.style.opacity = 0; }, 2600); };

  $('.x').onclick = function () { window.skyrimPlatform.sendMessage('sotrAdminClose'); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.style.display !== 'none') window.skyrimPlatform.sendMessage('sotrAdminClose'); });
  root.querySelectorAll('.nav div').forEach(function (d) {
    d.onclick = function () {
      root.querySelectorAll('.nav div').forEach(function (x) { x.classList.toggle('on', x === d); });
      root.querySelectorAll('.page').forEach(function (x) { x.classList.toggle('on', x.id === 'sa-' + d.dataset.p); });
      if (d.dataset.p !== 'spawn') send({ op: 'players' });
    };
  });

  function renderGroups() {
    var groups = ['All'];
    S.families.forEach(function (f) { if (groups.indexOf(f.group) < 0) groups.push(f.group); });
    $('#sa-groups').innerHTML = groups.map(function (g) { return '<span class="tab' + (g === S.group ? ' on' : '') + '" data-g="' + esc(g) + '">' + esc(g) + '</span>'; }).join('');
    $('#sa-groups').querySelectorAll('.tab').forEach(function (c) { c.onclick = function () { S.group = c.dataset.g; renderGroups(); renderGrid(); }; });
  }
  function renderGrid() {
    var list = S.families.filter(function (f) { return S.group === 'All' || f.group === S.group; });
    $('#sa-grid').innerHTML = list.map(function (f) {
      return '<div class="' + (S.fam && S.fam.key === f.key ? 'on' : '') + '" data-k="' + f.key + '">' + esc(f.name) + '<small>' + f.count + ' variants</small></div>';
    }).join('');
    $('#sa-grid').querySelectorAll('[data-k]').forEach(function (c) {
      c.onclick = function () {
        S.fam = S.families.filter(function (f) { return f.key === c.dataset.k; })[0];
        S.role = 'any'; S.tier = 'any'; S.showList = false;
        renderGrid(); renderDetail();
        if (!S.variants[S.fam.key]) send({ op: 'variants', family: S.fam.key });
      };
    });
  }
  function tabRow(items, cur, names, attr) {
    return '<div class="tabs">' + ['any'].concat(items).map(function (k) {
      return '<span class="tab' + (k === cur ? ' on' : '') + '" data-' + attr + '="' + k + '">' + (k === 'any' ? 'Any' : esc(names[k] || k)) + '</span>';
    }).join('') + '</div>';
  }
  function filteredVariants() {
    return (S.variants[S.fam.key] || []).filter(function (v) { return (S.role === 'any' || v.role === S.role) && (S.tier === 'any' || v.tier === S.tier); });
  }
  function renderDetail() {
    var f = S.fam;
    if (!f) return;
    var h = '<h3>' + esc(f.name) + '</h3>';
    if (f.roles.length > 1) h += '<label>Type</label>' + tabRow(f.roles, S.role, S.roleNames, 'role');
    if (f.tiers.length > 1) h += '<label>Strength</label>' + tabRow(['weak', 'mid', 'strong'].filter(function (t) { return f.tiers.indexOf(t) >= 0; }), S.tier, S.tierNames, 'tier');
    h += '<label>Count</label><div class="step"><button class="s" id="sa-minus">-</button><span id="sa-n">' + S.n + '</span><button class="s" id="sa-plus">+</button></div>';
    h += '<button class="wide" id="sa-go">Spawn random</button>';
    h += '<button class="wide" id="sa-mine">Remove my creatures</button>';
    h += '<label style="cursor:pointer" id="sa-toggle">' + (S.showList ? 'Hide variants' : 'Choose a variant') + '</label>';
    if (S.showList) {
      var vs = filteredVariants();
      h += '<div class="list">' + (S.variants[f.key] ? (vs.length ? vs.map(function (v) {
        return '<div data-id="' + v.id + '">' + esc(v.name) + '</div>';
      }).join('') : '<div class="empty">No variants match.</div>') : '<div class="empty">Loading...</div>') + '</div>';
    }
    var d = $('#sa-detail');
    d.innerHTML = h;
    d.querySelectorAll('[data-role]').forEach(function (c) { c.onclick = function () { S.role = c.dataset.role; renderDetail(); }; });
    d.querySelectorAll('[data-tier]').forEach(function (c) { c.onclick = function () { S.tier = c.dataset.tier; renderDetail(); }; });
    $('#sa-minus').onclick = function () { S.n = Math.max(1, S.n - 1); $('#sa-n').textContent = S.n; };
    $('#sa-plus').onclick = function () { S.n = Math.min(10, S.n + 1); $('#sa-n').textContent = S.n; };
    $('#sa-go').onclick = function () { send({ op: 'spawn', family: f.key, role: S.role, tier: S.tier, n: S.n }); };
    $('#sa-mine').onclick = function () { send({ op: 'clear' }); };
    $('#sa-toggle').onclick = function () { S.showList = !S.showList; renderDetail(); };
    d.querySelectorAll('.list [data-id]').forEach(function (r) { r.onclick = function () { send({ op: 'spawn', family: f.key, id: +r.dataset.id, n: S.n }); }; });
  }
  function renderPlayers(players, stats) {
    var acts = [['goto', 'Go to'], ['bring', 'Bring'], ['heal', 'Heal'], ['level', 'Level up'], ['xp', '+100 XP'], ['resetPerks', 'Reset perks'], ['resetSkills', 'Reset skills'], ['kill', 'Kill']];
    $('#sa-ptable').innerHTML = players.length ? '<table><tr><th>Player</th><th>Level</th><th>XP</th><th>Health</th><th>Perks</th><th>Skills</th><th></th></tr>' + players.map(function (p) {
      return '<tr><td>' + esc(p.name) + (p.id === S.me ? ' <small style="color:#777">(you)</small>' : '') + '</td><td>' + p.lvl + '</td><td>' + p.xp + ' / ' + p.need + '</td>'
        + '<td>' + (p.dead ? 'Dead' : p.hp + '%') + '</td><td>' + p.pp + '</td><td>' + p.sp + '</td><td><div class="acts">'
        + acts.filter(function (a) { return p.id !== S.me || (a[0] !== 'goto' && a[0] !== 'bring'); }).map(function (a) { return '<button class="s' + (a[0] === 'kill' || a[0].indexOf('reset') === 0 ? ' danger' : '') + '" data-t="' + p.id + '" data-a="' + a[0] + '">' + a[1] + '</button>'; }).join('') + '</div></td></tr>';
    }).join('') + '</table>' : '<div class="empty">No players online.</div>';
    $('#sa-ptable').querySelectorAll('button').forEach(function (b) {
      b.onclick = function () {
        if ((b.dataset.a === 'kill' || b.dataset.a.indexOf('reset') === 0) && !sure(b.dataset.a + b.dataset.t, 'Are you sure?')) return;
        send({ op: 'player', target: +b.dataset.t, action: b.dataset.a, amount: 100 });
      };
    });
    if (stats) {
      $('#sa-stats').innerHTML = '<div class="stat"><b>' + stats.online + '</b>Players online</div><div class="stat"><b>' + stats.spawned + '</b>Spawned creatures</div><div class="stat"><b>' + (stats.uptimeMin >= 60 ? Math.floor(stats.uptimeMin / 60) + 'h ' : '') + (stats.uptimeMin % 60) + 'm</b>Uptime</div>';
    }
  }
  $('#sa-refresh').onclick = function () { send({ op: 'players' }); };
  $('#sa-ann-send').onclick = function () { var t = $('#sa-ann').value; if (t.trim()) { send({ op: 'announce', text: t }); $('#sa-ann').value = ''; } };
  $('#sa-clear-all').onclick = function () { if (sure('clearAll', 'All spawned creatures will be removed.')) send({ op: 'clearAll' }); };

  window.sotrAdminRecv = function (m) {
    if (m.type === 'init') {
      S.families = m.families; S.roleNames = m.roleNames; S.tierNames = m.tierNames; S.me = m.me;
      renderGroups(); renderGrid(); renderPlayers(m.players, m.stats);
    } else if (m.type === 'variants') {
      S.variants[m.family] = m.items;
      if (S.fam && S.fam.key === m.family) renderDetail();
    } else if (m.type === 'players') {
      renderPlayers(m.players, m.stats);
    } else if (m.type === 'toast') {
      toast(m.text);
    }
  };
}

function sotrSkillPanel(show) {
  var root = document.getElementById('sotr-skills');
  if (!show) { if (root) root.style.display = 'none'; return; }
  if (!root) {
    var css = ''
      + '#sotr-skills{position:fixed;top:50%;right:40px;transform:translateY(-50%);width:330px;z-index:99998;font:14px "Segoe UI",sans-serif;color:#eadfc8;background:linear-gradient(180deg,rgba(28,24,19,.96),rgba(16,14,11,.96));border:1px solid #9c8352;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.6)}'
      + '#sotr-skills .hd{padding:12px 14px;border-bottom:1px solid #4a3f2c;display:flex;align-items:center}#sotr-skills .hd b{color:#e6c77f;font-size:16px}'
      + '#sotr-skills .hd .x{margin-left:auto;cursor:pointer;opacity:.7}'
      + '#sotr-skills .pts{padding:10px 14px;font-size:13px;border-bottom:1px solid #2c261c}#sotr-skills .pts b{color:#e6c77f;font-size:18px}'
      + '#sotr-skills .row{display:flex;align-items:center;padding:5px 14px;gap:8px}#sotr-skills .row:hover{background:#221d15}'
      + '#sotr-skills .row .n{flex:1}#sotr-skills .row .v{width:30px;text-align:right;color:#e6c77f}'
      + '#sotr-skills button{font:inherit;font-size:12px;color:#fff;background:#6b5530;border:1px solid #9c8352;border-radius:5px;padding:2px 7px;cursor:pointer}'
      + '#sotr-skills button:disabled{opacity:.3;cursor:default}#sotr-skills .ft{padding:9px 14px;font-size:12px;opacity:.55;border-top:1px solid #2c261c}'
      + '#sotr-skills .list{max-height:470px;overflow:auto}';
    root = document.createElement('div');
    root.id = 'sotr-skills';
    root.innerHTML = '<style>' + css + '</style><div class="hd"><b>📜 Beceri Puanları</b><span class="x">✕</span></div><div class="pts" id="ss-pts"></div><div class="list" id="ss-list"></div>'
      + '<div class="ft">Puanlar level atlayınca gelir. Perkleri Skyrim\'in Beceriler menüsünden seç. Kapat: K / Esc</div>';
    document.body.appendChild(root);
    root.querySelector('.x').onclick = function () { window.skyrimPlatform.sendMessage('sotrSkillsClose'); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.style.display !== 'none') window.skyrimPlatform.sendMessage('sotrSkillsClose'); });
    window.sotrSkillsRecv = function (d) {
      root.querySelector('#ss-pts').innerHTML = 'Dağıtılabilir beceri puanı: <b>' + d.sp + '</b> &nbsp;·&nbsp; Level ' + d.lvl + ' &nbsp;·&nbsp; Perk puanı ' + d.pp;
      root.querySelector('#ss-list').innerHTML = d.skills.map(function (s) {
        var can = d.sp > 0 && s.v < 100;
        return '<div class="row"><span class="n">' + s.name + '</span><span class="v">' + s.v + '</span>'
          + '<button data-av="' + s.id + '" data-n="1"' + (can ? '' : ' disabled') + '>+1</button><button data-av="' + s.id + '" data-n="5"' + (can ? '' : ' disabled') + '>+5</button></div>';
      }).join('');
      root.querySelectorAll('#ss-list button').forEach(function (b) {
        b.onclick = function () { window.skyrimPlatform.sendMessage('sotrSkill', b.dataset.av, +b.dataset.n); };
      });
    };
  }
  root.style.display = 'block';
}
/* eslint-enable no-var */
