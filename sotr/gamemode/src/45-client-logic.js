
// ---------------------------------------------------------------------------
// İstemci mantığı (Skyrim Platform); makeEventSource ile her oyuncuya gönderilir.
// ---------------------------------------------------------------------------

function sotrAdminClient(ctx, cfg) {
  if (ctx.state.sotrAdminInit) return;
  ctx.state.sotrAdminInit = true;
  const sp = ctx.sp;
  const F7 = 0x41;
  let wasDown = false;
  let open = false;

  const setOpen = (v) => {
    open = v;
    if (v) sp.browser.setVisible(true);
    if (v) sp.browser.executeJavaScript('window.sotrPerfMark && window.sotrPerfMark("f7",' + Date.now() + ')');
    sp.browser.executeJavaScript('(' + cfg.panelSrc + ')(' + v + ')');
    sp.browser.setFocused(v);
    if (v) ctx.sendEvent({ op: 'init' });
  };

  sp.on('update', () => {
    const down = sp.Input.isKeyPressed(F7);
    if (down && !wasDown) setOpen(!open);
    wasDown = down;
  });

  sp.on('browserMessage', (e) => {
    if (e.arguments[0] === 'sotrAdminClose') {
      if (open) setOpen(false);
      return;
    }
    if (e.arguments[0] !== 'sotrAdmin') return;
    try { ctx.sendEvent(JSON.parse(e.arguments[1])); } catch (err) { sp.printConsole('[sotr-admin] ' + err); }
  });
}

function sotrProgClient(ctx, cfg) {
  if (ctx.state.sotrProgInit) return;
  ctx.state.sotrProgInit = true;
  const sp = ctx.sp;
  const K = 0x25;
  const SKILLS = cfg.skills; // [[av, ad]]
  const REPLACED = cfg.replaced;
  const log = (m) => sp.printConsole('[sotr-prog] ' + m);

  const player = () => sp.Game.getPlayer();
  const avi = (id) => sp.ActorValueInfo.getActorValueInfoByName(id);
  const perkForm = (id) => sp.Perk.from(sp.Game.getFormEx(id));
  const diag = (m) => { log(m); try { ctx.sendEvent({ op: 'diag', text: '' + m }); } catch (err) { /* yoksay */ } };
  // Sahip olunan perkler: sunucunun ESM'den okuduğu ağaç perkleri (cfg.treePerks) hasPerk ile süzülür
  const ownedPerks = () => {
    const out = [];
    const pl = player();
    for (const id of cfg.treePerks) {
      const pk = perkForm(id);
      if (pk && pl.hasPerk(pk)) out.push(id);
    }
    return out;
  };
  const bases = () => {
    const pl = player();
    return { h: pl.getBaseActorValue('Health'), m: pl.getBaseActorValue('Magicka'), s: pl.getBaseActorValue('Stamina') };
  };

  // Beceriler kullanarak artmasın (Static Skill Leveling); kitap/eğitmen artışlarını sunucu değeri geri alır.
  const disableSkillUse = () => {
    for (const [id] of SKILLS) {
      try { const a = avi(id); if (a) a.setSkillUseMult(0); } catch (err) { /* yoksay */ }
    }
  };

  let menuOpen = false;
  let waitSeq = -1; // menü kapandıktan sonra sunucu yanıtı gelene kadar uygulama yapma
  let waitUntil = 0;
  let lastBases = null;
  let lastApplied = -1;
  let skillsOpen = false;
  let helloAt = Date.now() + 4000;
  let helloSent = false;
  let lastApply = 0;
  let dirty = true;

  const prog = () => sp.storage['sotrProg'];

  const apply = () => {
    const p = prog();
    const pl = player();
    if (!p || !pl || menuOpen) return;
    if (waitSeq >= 0) {
      if (p.seq === waitSeq && Date.now() < waitUntil) return;
      waitSeq = -1;
    }
    if (pl.getLevel() !== p.lvl) sp.Game.setPlayerLevel(p.lvl);
    if (Math.abs(sp.Game.getPlayerExperience() - p.xp) > 0.5) sp.Game.setPlayerExperience(p.xp);
    if (sp.Game.getPerkPoints() !== p.pp) sp.Game.setPerkPoints(p.pp);
    for (const [id] of SKILLS) {
      const want = p.skills[id];
      if (typeof want === 'number' && Math.round(pl.getBaseActorValue(id)) !== want) pl.setActorValue(id, want);
    }
    if (p.av) {
      const AVN = { h: 'Health', m: 'Magicka', s: 'Stamina' };
      for (const k of ['h', 'm', 's']) {
        if (typeof p.av[k] === 'number' && Math.round(pl.getBaseActorValue(AVN[k])) !== Math.round(p.av[k])) pl.setActorValue(AVN[k], p.av[k]);
      }
    }
    if (p.seq !== lastApplied || dirty) {
      const owned = ownedPerks();
      const want = p.perks.filter((id) => REPLACED.indexOf(id) < 0);
      for (const id of want) {
        if (owned.indexOf(id) < 0) { const pk = perkForm(id); if (pk) pl.addPerk(pk); }
      }
      for (const id of owned) {
        if (want.indexOf(id) < 0) { const pk = perkForm(id); if (pk) pl.removePerk(pk); }
      }
      lastApplied = p.seq;
      dirty = false;
    }
    lastBases = bases();
    if (skillsOpen) pushSkillPanel();
  };

  const pushSkillPanel = () => {
    const p = prog();
    if (!p) return;
    const data = { sp: p.sp, pp: p.pp, lvl: p.lvl, skills: SKILLS.map(([id, name]) => ({ id, name, v: p.skills[id] })) };
    sp.browser.executeJavaScript('window.sotrSkillsRecv && window.sotrSkillsRecv(' + JSON.stringify(data) + ')');
  };
  const setSkillsOpen = (v) => {
    skillsOpen = v;
    if (v) sp.browser.setVisible(true);
    sp.browser.executeJavaScript('(' + cfg.skillPanelSrc + ')(' + v + ')');
    sp.browser.setFocused(v);
    if (v) pushSkillPanel();
  };

  // Menü kapanınca: level atlamalarını ve seçilen perkleri sunucuya bildir
  const onMenuClosed = () => {
    const p = prog();
    const pl = player();
    if (!p || !pl) return;
    const lvlNow = pl.getLevel();
    const ups = lvlNow - p.lvl;
    if (ups > 0) {
      const now = bases();
      const prev = lastBases || now;
      const attrs = [];
      for (const k of ['h', 'm', 's']) {
        for (let i = 0; i < Math.round((now[k] - prev[k]) / 10); i++) attrs.push(k);
      }
      for (let i = 0; i < ups; i++) ctx.sendEvent({ op: 'levelup', lvl: p.lvl + i + 1, attr: attrs[i] || 'h' });
      log('level atlama bildirildi: ' + ups + ' (' + attrs.join(',') + ')');
    }
    // Level ekranında dağıtılan beceri puanları (sunucu puan bütçesine göre doğrular)
    SKILLS.forEach(([id], i) => { if (spent[i] > 0) ctx.sendEvent({ op: 'skill', av: id, n: spent[i] }); });
    spent = SKILLS.map(() => 0);
    menuSp = null;
    ctx.sendEvent({ op: 'perks', owned: ownedPerks() });
    waitSeq = p.seq;
    waitUntil = Date.now() + 5000;
    dirty = true;
  };

  // Level ekranı = Static Skill Leveling Rewritten'in levelupmenu.swf'i (Nexus 89940, yalnız arayüz dosyası).
  // Modun Papyrus'u yerine menüyü biz besliyoruz: puan = sunucudaki dağıtılmamış puan + bu level'ın puanı.
  const LEVELUP = 'LevelUp Menu';
  const CALL = '_root.LevelUpMenu_mc.';
  let spent = SKILLS.map(() => 0);
  let menuSp = null;
  // menuOpen olayı SWF yüklenmeden gelir; veri kısa aralıklarla birkaç kez gönderilir (oyuncu dağıtmaya başlamadan)
  let feedAt = [];
  const feedLevelUpMenu = () => {
    sp.Ui.invokeIntA(LEVELUP, CALL + 'setSkillCaps', SKILLS.map(() => cfg.skillMax));
    // [kullanılmıyor, bir becerinin level başına en çok artışı, puan, maliyetler 0-25/25-50/50-75/75+]
    sp.Ui.invokeIntA(LEVELUP, CALL + 'setLevelingSettings', [-1, cfg.skillMax, menuSp, 1, 1, 1, 1]);
    // getPlayer() önbellekli nesne döndürüyor ve invokeForm'da "Invalid _skyrimPlatform_indexInPool" veriyor; her seferinde taze form
    try { sp.Ui.invokeForm(LEVELUP, CALL + 'setPlayer', sp.Game.getFormEx(0x14)); } catch (err) { if (!feedErr) { feedErr = true; diag('level ekranı setPlayer ' + err); } }
  };
  let feedErr = false;
  sp.on('modEvent', (e) => {
    if (e.eventName !== 'SSL_SkillsDistributionCompleted') return;
    const diffs = ('' + e.strArg).split(';').map((x) => Math.max(0, parseInt(x, 10) || 0));
    SKILLS.forEach((_, i) => { spent[i] += diffs[i] || 0; });
    menuSp = Math.max(0, Math.round(e.numArg));
    log('level ekranı dağıtımı: ' + diffs.join(';') + ' kalan ' + menuSp);
  });

  const MENUS = ['StatsMenu', LEVELUP];
  // Level ekranı Beceriler menüsünün içinden açılır: biri kapanınca diğeri hâlâ açık olabilir
  const openMenus = new Set();
  sp.on('menuOpen', (e) => {
    if (MENUS.indexOf(e.name) >= 0) { openMenus.add(e.name); menuOpen = true; }
    if (e.name === LEVELUP) {
      const p = prog();
      menuSp = (menuSp === null ? (p ? p.sp : 0) : menuSp) + cfg.pointsPerLevel;
      const now = Date.now();
      feedAt = [now + 30, now + 150, now + 400, now + 800];
    }
  });
  sp.on('menuClose', (e) => {
    if (MENUS.indexOf(e.name) < 0) return;
    openMenus.delete(e.name);
    if (openMenus.size > 0) return;
    menuOpen = false;
    try { onMenuClosed(); } catch (err) { diag('menü kapanış hatası ' + err); }
  });
  sp.on('skillIncrease', () => { dirty = true; });

  sp.on('browserMessage', (e) => {
    if (e.arguments[0] === 'sotrSkillsClose') {
      if (skillsOpen) setSkillsOpen(false);
    } else if (e.arguments[0] === 'sotrSkill') {
      ctx.sendEvent({ op: 'skill', av: e.arguments[1], n: e.arguments[2] });
    }
  });

  let kWasDown = false;
  sp.on('update', () => {
    const now = Date.now();
    if (feedAt.length && now >= feedAt[0]) {
      feedAt.shift();
      if (menuOpen) { try { feedLevelUpMenu(); } catch (err) { diag('level ekranı ' + err); feedAt = []; } }
    }
    const kDown = sp.Input.isKeyPressed(K);
    if (cfg.kPanel && kDown && !kWasDown && !menuOpen && (skillsOpen || !sp.browser.isFocused())) setSkillsOpen(!skillsOpen);
    kWasDown = kDown;

    if (!helloSent && now > helloAt && player()) {
      helloSent = true;
      disableSkillUse();
      const skills = {};
      for (const [id] of SKILLS) skills[id] = player().getBaseActorValue(id);
      let need = [];
      try { need = [1, 2, 10].map((l) => sp.Game.getExperienceForLevel(l)); } catch (err) { /* yoksay */ }
      ctx.sendEvent({ op: 'hello', skills, need });
    }
    const p = prog();
    if (!helloSent || !p) return;
    if (p.seq !== lastApplied || dirty || now - lastApply > 2000) {
      lastApply = now;
      try { apply(); } catch (err) { log('uygulama hatası ' + err); }
    }
  });
}
