
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
  // Ağacın tüm perklerini al, sahipliği hasPerk ile kendimiz süz (getPerks'in sahiplik süzgecine güvenme)
  const diag = (m) => { log(m); try { ctx.sendEvent({ op: 'diag', text: '' + m }); } catch (err) { /* yoksay */ } };
  const ownedPerks = () => {
    const out = [];
    const pl = player();
    for (const [id] of SKILLS) {
      let list = null;
      try { const a = avi(id); list = a ? a.getPerks(null, false, true) : null; } catch (err) { diag('getPerks ' + id + ': ' + err); }
      for (const p of list || []) {
        const pk = sp.Perk.from(p);
        if (pk && pl.hasPerk(pk) && out.indexOf(pk.getFormID()) < 0) out.push(pk.getFormID());
      }
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
    ctx.sendEvent({ op: 'perks', owned: ownedPerks() });
    waitSeq = p.seq;
    waitUntil = Date.now() + 5000;
    dirty = true;
  };

  const MENUS = ['StatsMenu', 'LevelUp Menu'];
  sp.on('menuOpen', (e) => {
    if (MENUS.indexOf(e.name) >= 0) menuOpen = true;
  });
  sp.on('menuClose', (e) => {
    if (MENUS.indexOf(e.name) < 0) return;
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
    const kDown = sp.Input.isKeyPressed(K);
    if (kDown && !kWasDown && !menuOpen && (skillsOpen || !sp.browser.isFocused())) setSkillsOpen(!skillsOpen);
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
