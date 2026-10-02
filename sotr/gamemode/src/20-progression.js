
// ---------------------------------------------------------------------------
// İlerleme: XP, level, beceri puanı, perk
// ---------------------------------------------------------------------------

const SKILLS = [
  ['OneHanded', 'Tek El'], ['TwoHanded', 'İki El'], ['Marksman', 'Okçuluk'], ['Block', 'Blok'],
  ['Smithing', 'Demircilik'], ['HeavyArmor', 'Ağır Zırh'], ['LightArmor', 'Hafif Zırh'], ['Pickpocket', 'Yankesicilik'],
  ['Lockpicking', 'Kilit Açma'], ['Sneak', 'Gizlilik'], ['Alchemy', 'Simya'], ['Speechcraft', 'Konuşma'],
  ['Alteration', 'Dönüşüm'], ['Conjuration', 'Çağırma'], ['Destruction', 'Yıkım'], ['Illusion', 'Yanılsama'],
  ['Restoration', 'İyileştirme'], ['Enchanting', 'Büyüleme'],
];
const SKILL_IDS = SKILLS.map((s) => s[0]);
const SKILL_POINTS_PER_LEVEL = 10;
const SKILL_MAX = 100;
const ATTR_PER_LEVEL = 10; // Skyrim'in level ekranındaki +10 can/büyü/dayanıklılık
// Skyrim: fXPLevelUpBase (75) + fXPLevelUpMult (25) * level; oyunun kendi çubuğu aynı eşiği kullanır
const xpForLevel = (lvl) => 75 + 25 * lvl;

// Skyrim.esm perk form id'leri (sıra = rank)
const PERKS = {
  armsman: [0xbabe4, 0x79343, 0x79342, 0x79344, 0x79345],
  barbarian: [0xbabe8, 0x79346, 0x79347, 0x79348, 0x79349],
  overdraw: [0xbabed, 0x7934a, 0x7934b, 0x7934d, 0x79354],
  augmented: [0x581e7, 0x10fcf8, 0x581ea, 0x10fcf9, 0x58200, 0x10fcfa],
  agileDefender: [0xbe123, 0x79376, 0x79389, 0x79391, 0x79392],
  juggernaut: [0xbcd2a, 0x7935e, 0x79361, 0x79362, 0x79374],
  shieldWall: [0xbccae, 0x79355, 0x79356, 0x79357, 0x79358],
  elementalProtection: [0x58f69],
  savageStrike: [0x3af81],
  devastatingBlow: [0x52d52],
  backstab: [0x58210],
  assassinsBlade: [0x58211],
  deadlyAim: [0x1036f0],
  steadyHand: [0x103ada, 0x103adb],
  quickReflexes: [0xd8c33],
};
// Çok oyunculuda çalışmayan (zamanı yavaşlatan) perkler: oyuncuda tutulmaz, yerine sunucu bonusu verilir.
const REPLACED_PERKS = {
  [0x103ada]: 'Keskin Nişan: yay hasarı +%25 (zaman yavaşlatma yerine)',
  [0x103adb]: 'Keskin Nişan: yay hasarı +%25 (zaman yavaşlatma yerine)',
  [0xd8c33]: 'Çevik Blok: blok yaparken alınan hasar %20 daha az (zaman yavaşlatma yerine)',
};

const rankOf = (perks, key) => PERKS[key].filter((id) => perks.includes(id)).length;
const skillMult = (v) => 1 + Math.max(0, (v || 15) - 15) / 170; // 15 -> x1, 100 -> x1.5

const armorTypeCache = new Map();
const armorTypeOf = (baseId) => {
  if (armorTypeCache.has(baseId)) return armorTypeCache.get(baseId);
  let t = -1;
  const rec = recordOf(baseId);
  if (rec && rec.type === 'ARMO') {
    const bod2 = fieldOf(rec, 'BOD2');
    const bodt = fieldOf(rec, 'BODT');
    if (bod2 && bod2.data.length >= 8) t = u32(bod2.data, 4);
    else if (bodt && bodt.data.length >= 12) t = u32(bodt.data, 8);
  }
  armorTypeCache.set(baseId, t);
  return t; // 0 hafif, 1 ağır, 2 kıyafet
};

const computeBonus = (actor, prog) => {
  const s = prog.skills || {};
  const perks = prog.perks || [];
  let heavy = 0;
  let light = 0;
  try {
    const eq = mp.get(actor, 'equipment');
    for (const e of ((eq && (eq.inv || eq).entries) || [])) {
      if (!e.worn) continue;
      const t = armorTypeOf(e.baseId);
      if (t === 0) light++;
      if (t === 1) heavy++;
    }
  } catch (e) { /* yoksay */ }
  let def = 1;
  if (heavy + light > 0) {
    const useHeavy = heavy >= light;
    const skill = useHeavy ? s.HeavyArmor : s.LightArmor;
    const rank = rankOf(perks, useHeavy ? 'juggernaut' : 'agileDefender');
    const coverage = Math.min(1, (heavy + light) / 4);
    def = 1 - coverage * ((0.25 * Math.max(0, (skill || 15) - 15)) / 85 + 0.04 * rank);
  }
  const augmented = rankOf(perks, 'augmented');
  const r = (x) => Math.round(x * 1000) / 1000;
  const attrs = prog.attrs || {};
  return {
    h: ATTR_PER_LEVEL * (attrs.h || 0),
    m: ATTR_PER_LEVEL * (attrs.m || 0),
    s: ATTR_PER_LEVEL * (attrs.s || 0),
    def: r(Math.max(0.5, def)),
    magicDef: rankOf(perks, 'elementalProtection') ? 0.85 : 1,
    block: r(Math.max(0.4, 1 - (0.3 * Math.max(0, (s.Block || 15) - 15)) / 85 - 0.04 * rankOf(perks, 'shieldWall') - (rankOf(perks, 'quickReflexes') ? 0.2 : 0))),
    // Savage Strike (tek el) ve Devastating Blow (iki el) power attack'e +%25; sunucu çarpanı silah türüne bakmadığı için ortak
    power: r(1 + 0.25 * (rankOf(perks, 'savageStrike') + rankOf(perks, 'devastatingBlow'))),
    // Sunucu tabanı gizli saldırıda x1,3; oyundaki x6/x15 çok oyunculuda fazla güçlü, ölçülü tutuldu
    sneak: r(Math.min(3, 1 + 0.5 * rankOf(perks, 'backstab') + 0.5 * rankOf(perks, 'deadlyAim') + 1 * rankOf(perks, 'assassinsBlade'))),
    atk: {
      oneHanded: r(skillMult(s.OneHanded) * (1 + 0.2 * rankOf(perks, 'armsman'))),
      twoHanded: r(skillMult(s.TwoHanded) * (1 + 0.2 * rankOf(perks, 'barbarian'))),
      archery: r(skillMult(s.Marksman) * (1 + 0.2 * rankOf(perks, 'overdraw')) * (rankOf(perks, 'steadyHand') ? 1.25 : 1)),
      bash: r(skillMult(s.Block)),
      destruction: r(skillMult(s.Destruction) * (1 + 0.08 * augmented)),
      staff: r(skillMult(s.Destruction)),
    },
  };
};

const getProg = (actor) => {
  try {
    const p = mp.get(actor, 'sotrProg');
    return p && p.v ? JSON.parse(JSON.stringify(p)) : null;
  } catch (e) {
    return null;
  }
};
let progSeq = Date.now() % 100000;
const pushBonus = (actor, prog) => {
  const bonus = computeBonus(actor, prog);
  let old;
  try { old = mp.get(actor, 'sotrBonus'); } catch (e) { /* yok */ }
  if (JSON.stringify(old) !== JSON.stringify(bonus)) mp.set(actor, 'sotrBonus', bonus);
};
const saveProg = (actor, prog) => {
  prog.seq = ++progSeq;
  prog.need = xpForLevel(prog.lvl);
  mp.set(actor, 'sotrProg', prog);
  pushBonus(actor, prog);
};
let noticeSeq = 0;
const notify = (actor, text) => {
  try { mp.set(actor, 'sotrNotice', { seq: ++noticeSeq, text }); } catch (e) { /* yoksay */ }
};
const newProg = (skills) => {
  const clean = {};
  for (const id of SKILL_IDS) clean[id] = Math.max(5, Math.min(SKILL_MAX, Math.round((skills && skills[id]) || 15)));
  return { v: 1, lvl: 1, xp: 0, pp: 0, sp: 0, skills: clean, base: Object.assign({}, clean), perks: [], attrs: { h: 0, m: 0, s: 0 } };
};

const grantXp = (actor, amount, reason) => {
  const prog = getProg(actor);
  if (!prog || amount <= 0) return;
  prog.xp = Math.round((prog.xp + amount) * 10) / 10;
  saveProg(actor, prog);
  const ready = prog.xp >= xpForLevel(prog.lvl) ? ' — level atlayabilirsin (Beceriler menüsü)' : '';
  notify(actor, `+${Math.round(amount)} XP${reason ? ' (' + reason + ')' : ''}${ready}`);
};

// NPC seviyesi: ACBS (PC seviye çarpanı destekli); şablonlu kayıtlarda editörId'deki 01..06 seviyesinden tahmin
const npcLevelOfBase = (baseId, playerLvl) => {
  const rec = recordOf(baseId);
  const acbs = fieldOf(rec, 'ACBS');
  let lvl = 0;
  if (acbs && acbs.data.length >= 14) {
    const flags = u32(acbs.data, 0);
    const raw = u16(acbs.data, 8);
    const calcMin = u16(acbs.data, 10);
    const calcMax = u16(acbs.data, 12) || 999;
    lvl = flags & 0x80 ? Math.min(calcMax, Math.max(calcMin, Math.round((playerLvl * raw) / 1000))) : raw;
  }
  if (lvl <= 1 && rec && rec.editorId) {
    // Yalnız ailenin ardından gelen iki haneli kademe (EncDraugr01…); "Radius1024" gibi sayılar sayılmaz
    const m = rec.editorId.match(/^Enc[A-Za-z]+?(\d\d)(?!\d)/);
    if (m) lvl = Math.max(2, +m[1] * 4);
    else if (/Dragon|Giant|Mammoth|Troll/.test(rec.editorId)) lvl = 25;
    else if (/Bear|Sabre|Werewolf|Hagraven|Spriggan/.test(rec.editorId)) lvl = 12;
    else lvl = Math.max(lvl, 4);
  }
  return Math.max(1, lvl);
};

const npcLevel = (ref, playerLvl) => npcLevelOfBase(baseIdOf(ref), playerLvl);

const XP_SHARE_RANGE = 4000;
// Genel XP hızı (2026-10-02, Burak: "her şey çok XP veriyor"): level 1'de ~20 kurt ya da ~7 draugr bir level eder
const XP_RATE = 0.5;
const killXp = (victimLvl, playerLvl) => {
  // Kendinden çok zayıf yaratıklar az XP verir
  const base = 5 + victimLvl * 2;
  const mult = Math.max(0.1, Math.min(1.3, 1 + (victimLvl - playerLvl) * 0.05));
  return base * mult * XP_RATE;
};

mp.onDeath = (victim, killer) => {
  try {
    if (!killer || victim === killer || isPlayer(victim) || !isPlayer(killer)) return;
    const kLoc = mp.get(killer, 'locationalData');
    const receivers = [[killer, 1]];
    for (const p of onlinePlayers()) {
      if (p === killer) continue;
      try {
        const loc = mp.get(p, 'locationalData');
        const near = loc.cellOrWorldDesc === kLoc.cellOrWorldDesc && Math.hypot(loc.pos[0] - kLoc.pos[0], loc.pos[1] - kLoc.pos[1]) < XP_SHARE_RANGE;
        if (near) receivers.push([p, 0.5]);
      } catch (e) { /* yoksay */ }
    }
    for (const [p, share] of receivers) {
      const prog = getProg(p);
      if (!prog) continue;
      const vl = npcLevel(victim, prog.lvl);
      const amount = killXp(vl, prog.lvl) * share;
      grantXp(p, amount, share < 1 ? 'grup' : '');
      console.log(`[sotr-prog] ${actorName(p)} ${victim.toString(16)} (seviye ${vl}) için ${amount.toFixed(1)} XP aldı`);
    }
  } catch (e) {
    console.log('[sotr-prog] onDeath hatası', e && e.message);
  }
};

const onProgEvent = (actor, msg) => {
  if (!msg || !isPlayer(actor)) return;
  if (msg.op === 'diag') { console.log(`[sotr-prog] istemci ${actorName(actor)}: ${String(msg.text).slice(0, 300)}`); return; }
  let prog = getProg(actor);
  if (msg.op === 'hello') {
    // Oyunun kendi level eşiği sunucununkiyle aynı olmalı (bir mod GMST'leri değiştirmiş olabilir)
    const want = [1, 2, 10].map(xpForLevel);
    if (Array.isArray(msg.need) && msg.need.length === 3 && msg.need.some((v, i) => Math.abs(v - want[i]) > 0.5)) {
      console.log(`[sotr-prog] UYARI: istemcinin level eşikleri farklı: ${msg.need.join('/')} (sunucu ${want.join('/')})`);
    }
    if (!prog) {
      prog = newProg(msg.skills);
      console.log(`[sotr-prog] ${actorName(actor)} için ilerleme kaydı açıldı`);
      // Eşit başlangıç (Daedric Online gibi): paçavra, kazma, balta, 50 altın, biraz yiyecek
      try {
        addToInventory(actor, [[0x3c9fe, 1], [0x3ca00, 1], [0xe3c16, 1], [0x2f2f4, 1], [0xf, 50], [0x65c97, 2], [0x64b2e, 2], [0x65c9f, 1]]);
      } catch (e) { console.log('[sotr-prog] başlangıç eşyası verilemedi', e && e.message); }
    }
    saveProg(actor, prog);
    return;
  }
  if (!prog) return;
  if (msg.op === 'levelup') {
    const need = xpForLevel(prog.lvl);
    if (prog.xp < need) {
      console.log(`[sotr-prog] ŞÜPHELİ: ${actorName(actor)} XP yetmeden level atladı (xp ${prog.xp}/${need}, istemci level ${msg.lvl})`);
      saveProg(actor, prog);
      return;
    }
    prog.xp = Math.round((prog.xp - need) * 10) / 10;
    prog.lvl += 1;
    prog.pp += 1;
    prog.sp += SKILL_POINTS_PER_LEVEL;
    const attr = ['h', 'm', 's'].includes(msg.attr) ? msg.attr : 'h';
    prog.attrs[attr] = (prog.attrs[attr] || 0) + 1;
    saveProg(actor, prog);
    notify(actor, `Level ${prog.lvl}! +1 perk puanı, +${SKILL_POINTS_PER_LEVEL} beceri puanı (K ile dağıt)`);
    console.log(`[sotr-prog] ${actorName(actor)} level ${prog.lvl} oldu (${attr})`);
  } else if (msg.op === 'perks') {
    const owned = (Array.isArray(msg.owned) ? msg.owned : []).map((x) => x >>> 0);
    console.log(`[sotr-prog] ${actorName(actor)} perk bildirimi: istemcide ${owned.length}, kayıtta ${prog.perks.length}, puan ${prog.pp}`);
    const added = [];
    for (const id of owned) {
      if (prog.perks.includes(id)) continue;
      if (prog.pp <= 0) {
        console.log(`[sotr-prog] ŞÜPHELİ: ${actorName(actor)} perk puanı olmadan ${id.toString(16)} aldı`);
        break;
      }
      prog.perks.push(id);
      prog.pp -= 1;
      added.push(id);
      if (REPLACED_PERKS[id]) notify(actor, REPLACED_PERKS[id]);
    }
    saveProg(actor, prog);
    if (added.length) console.log(`[sotr-prog] ${actorName(actor)} perk aldı: ${added.map((x) => x.toString(16)).join(',')}`);
  } else if (msg.op === 'skill') {
    if (!SKILL_IDS.includes(msg.av) || prog.sp <= 0 || prog.skills[msg.av] >= SKILL_MAX) {
      saveProg(actor, prog);
      return;
    }
    const n = Math.max(1, Math.min(prog.sp, SKILL_MAX - prog.skills[msg.av], msg.n | 0 || 1));
    prog.skills[msg.av] += n;
    prog.sp -= n;
    saveProg(actor, prog);
    console.log(`[sotr-prog] ${actorName(actor)} ${msg.av} +${n} → ${prog.skills[msg.av]} (kalan puan ${prog.sp})`);
  }
};

// Zırh değişince savunma bonusu güncellensin
every(10000, () => {
  for (const p of onlinePlayers()) {
    const prog = getProg(p);
    if (prog) pushBonus(p, prog);
  }
});
