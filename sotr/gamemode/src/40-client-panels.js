
// ---------------------------------------------------------------------------
// Tarayıcı (CEF) panelleri: istemcide sp.browser.executeJavaScript ile çalışır.
// Bu fonksiyonlar sunucuda çalışmaz; kaynak metinleri istemciye gönderilir.
// ---------------------------------------------------------------------------

/* eslint-disable no-var */
function sotrAdminPanel(show) {
  var root = document.getElementById('sotr-admin');
  if (!show) { if (root) root.style.display = 'none'; return; }
  if (root) { root.style.display = 'flex'; return; }

  var css = ''
    + '#sotr-admin{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:99999;font:14px "Segoe UI",sans-serif;color:#eadfc8}'
    + '#sotr-admin .win{width:820px;height:560px;display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(28,24,19,.97),rgba(16,14,11,.97));border:1px solid #9c8352;border-radius:10px;box-shadow:0 12px 50px rgba(0,0,0,.7)}'
    + '#sotr-admin .top{display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid #4a3f2c;font-size:17px;letter-spacing:.5px}'
    + '#sotr-admin .top b{color:#e6c77f}#sotr-admin .top .x{margin-left:auto;cursor:pointer;opacity:.7;font-size:18px}#sotr-admin .top .x:hover{opacity:1}'
    + '#sotr-admin .body{flex:1;display:flex;min-height:0}'
    + '#sotr-admin .nav{width:150px;border-right:1px solid #3a3124;padding:8px 0}'
    + '#sotr-admin .nav div{padding:11px 16px;cursor:pointer;border-left:3px solid transparent}#sotr-admin .nav div:hover{background:#2a241b}'
    + '#sotr-admin .nav div.on{background:#342b1f;border-left-color:#e6c77f;color:#fff}'
    + '#sotr-admin .page{flex:1;padding:14px 16px;overflow:auto;display:none}#sotr-admin .page.on{display:block}'
    + '#sotr-admin .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}'
    + '#sotr-admin .chip{padding:5px 11px;border:1px solid #5a4c33;border-radius:14px;cursor:pointer;font-size:13px;background:#1f1a13}'
    + '#sotr-admin .chip:hover{border-color:#9c8352}#sotr-admin .chip.on{background:#6b5530;border-color:#e6c77f;color:#fff}'
    + '#sotr-admin .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px}'
    + '#sotr-admin .card{padding:10px 6px;text-align:center;border:1px solid #3d3325;border-radius:8px;cursor:pointer;background:#1c1812}'
    + '#sotr-admin .card:hover{border-color:#9c8352;background:#261f16}#sotr-admin .card.on{border-color:#e6c77f;background:#3a2f1f}'
    + '#sotr-admin .card .i{font-size:28px}#sotr-admin .card .n{margin-top:4px;font-size:13px}#sotr-admin .card .c{font-size:11px;opacity:.55}'
    + '#sotr-admin .split{display:flex;gap:14px;height:100%}#sotr-admin .split .l{flex:1;overflow:auto}#sotr-admin .split .r{width:270px;border-left:1px solid #3a3124;padding-left:14px;overflow:auto}'
    + '#sotr-admin h3{margin:2px 0 10px;font-weight:600;color:#e6c77f}#sotr-admin label{display:block;margin:10px 0 5px;font-size:12px;opacity:.7;text-transform:uppercase;letter-spacing:.6px}'
    + '#sotr-admin button{font:inherit;color:#fff;background:#6b5530;border:1px solid #9c8352;border-radius:6px;padding:8px 12px;cursor:pointer}'
    + '#sotr-admin button:hover{background:#80663a}#sotr-admin button.big{width:100%;padding:11px;font-size:15px;margin-top:12px}'
    + '#sotr-admin button.ghost{background:transparent;border-color:#5a4c33;color:#eadfc8}#sotr-admin button.ghost:hover{background:#2a241b}'
    + '#sotr-admin button.danger{background:#6e2a22;border-color:#a1473a}#sotr-admin button.danger:hover{background:#86342a}'
    + '#sotr-admin button.s{padding:4px 7px;font-size:12px}'
    + '#sotr-admin input,#sotr-admin textarea{font:inherit;color:#eee;background:#120f0b;border:1px solid #4d4130;border-radius:6px;padding:7px;box-sizing:border-box}'
    + '#sotr-admin .step{display:flex;align-items:center;gap:8px}#sotr-admin .step span{min-width:26px;text-align:center;font-size:16px}'
    + '#sotr-admin .vlist div{padding:6px 8px;border-bottom:1px solid #2c261c;cursor:pointer;font-size:13px}#sotr-admin .vlist div:hover{background:#2a241b}'
    + '#sotr-admin .vlist small{opacity:.55;margin-left:6px}'
    + '#sotr-admin table{width:100%;border-collapse:collapse}#sotr-admin td,#sotr-admin th{padding:7px 6px;border-bottom:1px solid #2c261c;text-align:left;font-size:13px}#sotr-admin th{opacity:.6;font-weight:500}'
    + '#sotr-admin .bar{height:6px;background:#2a241b;border-radius:3px;overflow:hidden;width:90px}#sotr-admin .bar i{display:block;height:100%;background:#c9a55a}'
    + '#sotr-admin .stats{display:flex;gap:10px;margin-bottom:16px}#sotr-admin .stat{flex:1;padding:12px;border:1px solid #3d3325;border-radius:8px;background:#1c1812}#sotr-admin .stat b{display:block;font-size:24px;color:#e6c77f}'
    + '#sotr-admin .toast{position:absolute;bottom:26px;left:50%;transform:translateX(-50%);background:#2e261a;border:1px solid #9c8352;border-radius:8px;padding:9px 16px;opacity:0;transition:opacity .3s;pointer-events:none}'
    + '#sotr-admin .hint{font-size:12px;opacity:.55;margin-top:8px}#sotr-admin .empty{opacity:.6;padding:30px;text-align:center}';

  root = document.createElement('div');
  root.id = 'sotr-admin';
  root.innerHTML = '<style>' + css + '</style>'
    + '<div class="win"><div class="top">⚔️&nbsp;<b>Skyrim Online TR</b>&nbsp;— Yönetim<span class="x" title="Kapat (F7 / Esc)">✕</span></div>'
    + '<div class="body"><div class="nav">'
    + '<div data-p="spawn" class="on">🐺 Yaratıklar</div><div data-p="players">👥 Oyuncular</div><div data-p="server">📢 Sunucu</div>'
    + '</div>'
    + '<div class="page on" id="sa-spawn"><div class="split"><div class="l">'
    + '<div class="chips" id="sa-groups"></div><div class="grid" id="sa-grid"><div class="empty">Yükleniyor…</div></div></div>'
    + '<div class="r" id="sa-detail"><div class="empty">Soldan bir yaratık seç.</div></div></div></div>'
    + '<div class="page" id="sa-players"><div style="display:flex;align-items:center;margin-bottom:8px"><h3 style="margin:0">Çevrimiçi oyuncular</h3><button class="ghost s" id="sa-refresh" style="margin-left:auto">↻ Yenile</button></div><div id="sa-ptable"></div>'
    + '<div class="hint">📍 yanına git · 🧲 yanına çek · ❤️ iyileştir · ⭐ bir level ver · ✨ 100 XP · ♻️ perk sıfırla · 🔁 beceri sıfırla · ☠️ öldür</div></div>'
    + '<div class="page" id="sa-server"><div class="stats" id="sa-stats"></div>'
    + '<label>Duyuru (herkesin ekranında görünür)</label><textarea id="sa-ann" rows="3" style="width:100%" maxlength="200" placeholder="Örn: 10 dakika sonra sunucu yeniden başlayacak"></textarea>'
    + '<button id="sa-ann-send" style="margin-top:8px">📢 Duyur</button>'
    + '<label style="margin-top:22px">Temizlik</label><button class="danger" id="sa-clear-all">🧹 Sunucudaki tüm doğurulmuş yaratıkları kaldır</button></div>'
    + '</div></div><div class="toast" id="sa-toast"></div>';
  document.body.appendChild(root);

  var $ = function (s) { return root.querySelector(s); };
  var send = function (p) { window.skyrimPlatform.sendMessage('sotrAdmin', JSON.stringify(p)); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var S = { families: [], group: 'Hepsi', fam: null, role: 'any', tier: 'any', n: 1, variants: {}, showList: false, roleNames: {}, tierNames: {}, me: 0 };
  var toastTimer = 0;
  var armed = '';
  // CEF'te confirm() çalışmayabilir: tehlikeli işlemler ikinci tıkta onaylanır
  var sure = function (key, text) {
    if (armed === key) { armed = ''; return true; }
    armed = key;
    toast(text + ' Onaylamak için tekrar tıkla.');
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
    var groups = ['Hepsi'];
    S.families.forEach(function (f) { if (groups.indexOf(f.group) < 0) groups.push(f.group); });
    $('#sa-groups').innerHTML = groups.map(function (g) { return '<span class="chip' + (g === S.group ? ' on' : '') + '" data-g="' + esc(g) + '">' + esc(g) + '</span>'; }).join('');
    $('#sa-groups').querySelectorAll('.chip').forEach(function (c) { c.onclick = function () { S.group = c.dataset.g; renderGroups(); renderGrid(); }; });
  }
  function renderGrid() {
    var list = S.families.filter(function (f) { return S.group === 'Hepsi' || f.group === S.group; });
    $('#sa-grid').innerHTML = list.map(function (f) {
      return '<div class="card' + (S.fam && S.fam.key === f.key ? ' on' : '') + '" data-k="' + f.key + '"><div class="i">' + f.icon + '</div><div class="n">' + esc(f.name) + '</div><div class="c">' + f.count + ' çeşit</div></div>';
    }).join('');
    $('#sa-grid').querySelectorAll('.card').forEach(function (c) {
      c.onclick = function () {
        S.fam = S.families.filter(function (f) { return f.key === c.dataset.k; })[0];
        S.role = 'any'; S.tier = 'any'; S.showList = false;
        renderGrid(); renderDetail();
        if (!S.variants[S.fam.key]) send({ op: 'variants', family: S.fam.key });
      };
    });
  }
  function chipRow(items, cur, names, attr) {
    return '<div class="chips">' + ['any'].concat(items).map(function (k) {
      return '<span class="chip' + (k === cur ? ' on' : '') + '" data-' + attr + '="' + k + '">' + (k === 'any' ? 'Hepsi' : esc(names[k] || k)) + '</span>';
    }).join('') + '</div>';
  }
  function filteredVariants() {
    return (S.variants[S.fam.key] || []).filter(function (v) { return (S.role === 'any' || v.role === S.role) && (S.tier === 'any' || v.tier === S.tier); });
  }
  function renderDetail() {
    var f = S.fam;
    if (!f) return;
    var h = '<h3>' + f.icon + ' ' + esc(f.name) + '</h3>';
    if (f.roles.length > 1) h += '<label>Tür</label>' + chipRow(f.roles, S.role, S.roleNames, 'role');
    if (f.tiers.length > 1) h += '<label>Güç</label>' + chipRow(['weak', 'mid', 'strong'].filter(function (t) { return f.tiers.indexOf(t) >= 0; }), S.tier, S.tierNames, 'tier');
    h += '<label>Adet</label><div class="step"><button class="ghost s" id="sa-minus">−</button><span id="sa-n">' + S.n + '</span><button class="ghost s" id="sa-plus">+</button></div>';
    h += '<button class="big" id="sa-go">🎲 Rastgele doğur</button>';
    h += '<button class="ghost" id="sa-mine" style="width:100%;margin-top:8px">🧹 Doğurduklarımı temizle</button>';
    h += '<div style="margin-top:14px;cursor:pointer;opacity:.8" id="sa-toggle">' + (S.showList ? '▾' : '▸') + ' Belirli bir çeşit seç</div>';
    if (S.showList) {
      var vs = filteredVariants();
      h += '<div class="vlist">' + (S.variants[f.key] ? (vs.length ? vs.map(function (v) {
        return '<div data-id="' + v.id + '">' + esc(v.name) + '<small>' + esc((S.roleNames[v.role] || '') + (v.tier ? ' · ' + S.tierNames[v.tier] : '')) + '</small></div>';
      }).join('') : '<div class="empty">Bu seçime uyan çeşit yok.</div>') : '<div class="empty">Yükleniyor…</div>') + '</div>';
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
    d.querySelectorAll('.vlist [data-id]').forEach(function (r) { r.onclick = function () { send({ op: 'spawn', family: f.key, id: +r.dataset.id, n: S.n }); }; });
  }
  function renderPlayers(players, stats) {
    var acts = [['goto', '📍'], ['bring', '🧲'], ['heal', '❤️'], ['level', '⭐'], ['xp', '✨'], ['resetPerks', '♻️'], ['resetSkills', '🔁'], ['kill', '☠️']];
    $('#sa-ptable').innerHTML = players.length ? '<table><tr><th>Oyuncu</th><th>Level</th><th>XP</th><th>Can</th><th>Puan</th><th></th></tr>' + players.map(function (p) {
      var pct = Math.min(100, Math.round((100 * p.xp) / p.need));
      return '<tr><td>' + esc(p.name) + (p.id === S.me ? ' <small style="opacity:.5">(sen)</small>' : '') + '</td><td>' + p.lvl + '</td><td><div class="bar" title="' + p.xp + ' / ' + p.need + '"><i style="width:' + pct + '%"></i></div></td>'
        + '<td>' + (p.dead ? '☠️' : p.hp + '%') + '</td><td title="perk / beceri">' + p.pp + ' / ' + p.sp + '</td><td style="white-space:nowrap">'
        + acts.filter(function (a) { return p.id !== S.me || (a[0] !== 'goto' && a[0] !== 'bring'); }).map(function (a) { return '<button class="ghost s" data-t="' + p.id + '" data-a="' + a[0] + '">' + a[1] + '</button>'; }).join(' ') + '</td></tr>';
    }).join('') + '</table>' : '<div class="empty">Çevrimiçi oyuncu yok.</div>';
    $('#sa-ptable').querySelectorAll('button').forEach(function (b) {
      b.onclick = function () {
        if ((b.dataset.a === 'kill' || b.dataset.a.indexOf('reset') === 0) && !sure(b.dataset.a + b.dataset.t, 'Emin misin?')) return;
        send({ op: 'player', target: +b.dataset.t, action: b.dataset.a, amount: 100 });
      };
    });
    if (stats) {
      $('#sa-stats').innerHTML = '<div class="stat"><b>' + stats.online + '</b>çevrimiçi oyuncu</div><div class="stat"><b>' + stats.spawned + '</b>doğurulmuş yaratık</div><div class="stat"><b>' + (stats.uptimeMin >= 60 ? Math.floor(stats.uptimeMin / 60) + ' sa ' : '') + (stats.uptimeMin % 60) + ' dk</b>gamemode çalışma süresi</div>';
    }
  }
  $('#sa-refresh').onclick = function () { send({ op: 'players' }); };
  $('#sa-ann-send').onclick = function () { var t = $('#sa-ann').value; if (t.trim()) { send({ op: 'announce', text: t }); $('#sa-ann').value = ''; } };
  $('#sa-clear-all').onclick = function () { if (sure('clearAll', 'Tüm doğurulmuş yaratıklar kaldırılacak')) send({ op: 'clearAll' }); };

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
