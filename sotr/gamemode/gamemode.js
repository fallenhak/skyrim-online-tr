// Skyrim Online TR gamemode
// - F7: yönetici paneli (yaratık doğurma, oyuncular, ilerleme, sunucu)
// - İlerleme: NPC öldürünce XP, Skyrim'in kendi level/perk arayüzü, level başına beceri puanı
//   (Experience modunun "Static Skill Leveling" eklentisi gibi; beceriler kullanarak artmaz)
// Kaynak: fallenhak/skyrim-online-tr, sotr/gamemode/gamemode.js; sunucuya /srv/skymp/server/gamemode.js olarak kurulur.

const fs = require('fs');

// Boşsa herkes kullanabilir (test sunucusu); profileId'ler logda "[sotr-admin]" satırlarında görünür.
const ADMIN_PROFILE_IDS = [];
const MAX_COUNT = 10;

// Gamemode her değiştiğinde yeniden yüklenir; eski zamanlayıcılar birikmesin.
globalThis.sotrTimers = globalThis.sotrTimers || [];
for (const t of globalThis.sotrTimers) clearInterval(t);
globalThis.sotrTimers = [];
const every = (ms, fn) => {
  const t = setInterval(() => { try { fn(); } catch (e) { console.log('[sotr] zamanlayıcı hatası', e && e.message); } }, ms);
  globalThis.sotrTimers.push(t);
};

const isPlayer = (id) => {
  try { return mp.get(id, 'profileId') >= 0; } catch (e) { return false; }
};
const actorName = (id) => {
  try { const a = mp.get(id, 'appearance'); if (a && a.name) return a.name; } catch (e) { /* yok */ }
  return id.toString(16);
};
const onlinePlayers = () => {
  try { return mp.get(0, 'onlinePlayers') || []; } catch (e) { return []; }
};
const recordOf = (id) => {
  try { return mp.lookupEspmRecordById(id).record; } catch (e) { return null; }
};
const fieldOf = (rec, type) => (rec && rec.fields || []).find((f) => f.type === type);
const u16 = (d, o) => d[o] | (d[o + 1] << 8);
const u32 = (d, o) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
const baseIdOf = (ref) => {
  try {
    const [hex, file] = `${mp.get(ref, 'baseDesc')}`.split(':');
    if (file === 'Skyrim.esm') return parseInt(hex, 16);
  } catch (e) { /* yok */ }
  return spawnedBase.get(ref) || 0;
};

// ---------------------------------------------------------------------------
// Yaratık kataloğu: Skyrim.esm'deki Enc* NPC şablonları, ailelere ayrılmış
// ---------------------------------------------------------------------------

// Tarama ~20 sn sürdüğü için dosyada saklanır; gamemode geçici klasörden require edilir, yol çalışma klasörüne göre.
const CATALOG_FILE = process.cwd() + '/sotr-admin-catalog.json';
let catalog = [];
try { catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8')); } catch (e) { /* ilk açılış */ }
if (catalog.length === 0) {
  const t0 = Date.now();
  for (let id = 0x10000; id < 0x110000; id++) {
    const rec = recordOf(id);
    if (rec && rec.type === 'NPC_' && /^Enc/.test(rec.editorId || '')) catalog.push({ id, name: rec.editorId });
  }
  catalog.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog));
  console.log(`[sotr-admin] katalog tarandı: ${catalog.length} kayıt, ${Date.now() - t0} ms`);
}

const FAMILIES = [
  { key: 'wolf', name: 'Kurt', icon: '🐺', group: 'Hayvanlar', re: /^EncWolf/ },
  { key: 'bear', name: 'Ayı', icon: '🐻', group: 'Hayvanlar', re: /^EncBear/ },
  { key: 'sabre', name: 'Kılıçdiş', icon: '🐆', group: 'Hayvanlar', re: /^EncSabre/ },
  { key: 'troll', name: 'Trol', icon: '👹', group: 'Hayvanlar', re: /^EncTroll/ },
  { key: 'spider', name: 'Örümcek', icon: '🕷️', group: 'Hayvanlar', re: /^EncFrostbite/ },
  { key: 'skeever', name: 'Skeever', icon: '🐀', group: 'Hayvanlar', re: /^EncSkeever/ },
  { key: 'chaurus', name: 'Chaurus', icon: '🪲', group: 'Hayvanlar', re: /^EncChaurus/ },
  { key: 'mudcrab', name: 'Çamur yengeci', icon: '🦀', group: 'Hayvanlar', re: /^EncMudcrab/ },
  { key: 'horker', name: 'Horker', icon: '🦭', group: 'Hayvanlar', re: /^EncHorker/ },
  { key: 'mammoth', name: 'Mamut', icon: '🦣', group: 'Hayvanlar', re: /^EncMammoth/ },
  { key: 'giant', name: 'Dev', icon: '🗿', group: 'Hayvanlar', re: /^EncGiant/ },
  { key: 'deer', name: 'Av hayvanı', icon: '🦌', group: 'Hayvanlar', re: /^Enc(Elk|Deer|Goat|Fox|Hare)/ },
  { key: 'werewolf', name: 'Kurt adam', icon: '🌕', group: 'Canavarlar', re: /^EncWerewolf/ },
  { key: 'dragon', name: 'Ejderha', icon: '🐉', group: 'Canavarlar', re: /^EncDragon(?!Priest)/ },
  { key: 'hagraven', name: 'Hagraven', icon: '🪶', group: 'Canavarlar', re: /^EncHagraven/ },
  { key: 'spriggan', name: 'Spriggan', icon: '🌿', group: 'Canavarlar', re: /^EncSpriggan/ },
  { key: 'atronach', name: 'Atronach', icon: '🔥', group: 'Canavarlar', re: /^EncAtronach/ },
  { key: 'dremora', name: 'Dremora', icon: '😈', group: 'Canavarlar', re: /^EncDremora/ },
  { key: 'wisp', name: 'Wispmother', icon: '👻', group: 'Canavarlar', re: /^EncWisp/ },
  { key: 'dwarven', name: 'Dwemer makinesi', icon: '⚙️', group: 'Canavarlar', re: /^EncDwarven/ },
  { key: 'draugr', name: 'Draugr', icon: '💀', group: 'Ölümsüzler', re: /^EncDraugr/ },
  { key: 'skeleton', name: 'İskelet', icon: '☠️', group: 'Ölümsüzler', re: /^EncSkeleton/ },
  { key: 'dragonpriest', name: 'Ejderha rahibi', icon: '🎭', group: 'Ölümsüzler', re: /^EncDragonPriest/ },
  { key: 'vampire', name: 'Vampir', icon: '🧛', group: 'Ölümsüzler', re: /^EncVampire/ },
  { key: 'falmer', name: 'Falmer', icon: '👁️', group: 'Ölümsüzler', re: /^EncFalmer/ },
  { key: 'bandit', name: 'Haydut', icon: '🗡️', group: 'İnsanlar', re: /^EncBandit/ },
  { key: 'warlock', name: 'Büyücü', icon: '🔮', group: 'İnsanlar', re: /^EncWarlock/ },
  { key: 'forsworn', name: 'Forsworn', icon: '🪓', group: 'İnsanlar', re: /^EncForsworn/ },
  { key: 'thalmor', name: 'Thalmor', icon: '🦅', group: 'İnsanlar', re: /^EncThalmor/ },
  { key: 'alikr', name: "Alik'r savaşçısı", icon: '🏜️', group: 'İnsanlar', re: /^EncAlikr/ },
  { key: 'witch', name: 'Cadı', icon: '🧙', group: 'İnsanlar', re: /^EncWitch/ },
  { key: 'vigilant', name: 'Stendarr gözcüsü', icon: '✝️', group: 'İnsanlar', re: /^EncVigilant/ },
  { key: 'hunter', name: 'Avcı', icon: '🏹', group: 'İnsanlar', re: /^EncHunter/ },
];
const SKIP_RE = /Template|Dead|SprigganCompanion|NoScript|Summon|_Indoor/;
const ROLE_NAMES = { melee: 'Yakın dövüş', ranged: 'Okçu', magic: 'Büyücü', boss: 'Boss' };
const TIER_NAMES = { weak: 'Zayıf', mid: 'Orta', strong: 'Güçlü' };

const roleOf = (ed) => {
  if (/Boss/.test(ed)) return 'boss';
  if (/Missile|Archer/.test(ed)) return 'ranged';
  if (/Magic|Shaman|Fire|Ice(?!Wolf)|Storm|Necro|Atro|Conjurer|Spellsword|Mage/.test(ed) && !/^Enc(Wolf|Troll|Bear|Atronach|Wisp|Dragon)/.test(ed)) return 'magic';
  return 'melee';
};
const tierOf = (ed) => {
  const m = ed.match(/[A-Za-z](\d\d)/);
  if (!m) return null;
  const n = +m[1];
  return n <= 2 ? 'weak' : n <= 4 ? 'mid' : 'strong';
};
// "EncDraugr05Melee1HEbonyHeadF02" -> "Tek el · Ebony · ♀ (sv 05)"
const NAME_WORDS = [
  [/Melee1H/g, 'Tek el'], [/Melee2H/g, 'İki el'], [/Boss1H/g, 'Boss tek el'], [/Boss2H/g, 'Boss iki el'], [/Missile/g, 'Okçu'],
  [/Magic/g, 'Büyücü'], [/Ambush/g, 'Pusu'], [/Tank/g, 'Kalkanlı'], [/Berserk/g, 'Çılgın'], [/Shaman/g, 'Şaman'],
  [/Spellsword/g, 'Büyülü kılıç'], [/Fire/g, 'Ateş'], [/Ice/g, 'Buz'], [/Frost/g, 'Buz'], [/Storm/g, 'Şimşek'], [/Shock/g, 'Şimşek'],
  [/Necro/g, 'Nekromans'], [/Atro/g, 'Atronach'], [/Conjurer/g, 'Çağırıcı'], [/Snow/g, 'Kar'], [/Cave/g, 'Mağara'], [/Red/g, 'Kızıl'],
  [/DarkElf/g, 'Kara elf'], [/HighElf/g, 'Yüce elf'], [/WoodElf/g, 'Orman elfi'], [/Melee/g, 'Yakın dövüş'], [/Boss/g, 'Boss'],
];
const friendly = (ed) => {
  let s = ed.replace(/^Enc[A-Z][a-z]+/, '');
  const tier = (s.match(/^(\d\d)/) || [])[1];
  s = s.replace(/^\d\d/, '');
  const gender = /F\d*$/.test(s) ? '♀' : /[a-z]M\d*$/.test(s) ? '♂' : '';
  s = s.replace(/[MF]\d*$/, '').replace(/Head/g, '');
  for (const [re, tr] of NAME_WORDS) s = s.replace(re, ` ${tr} `);
  const parts = s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').split(/\s{2,}|\s(?=[A-ZÇİÖŞÜ][a-zçğıöşü]+ )/).map((x) => x.trim()).filter(Boolean);
  if (gender) parts.push(gender);
  return (parts.join(' · ') || 'Standart') + (tier ? ` (sv ${tier})` : '');
};

const familyVariants = new Map(); // key -> [{ id, name, role, tier }]
for (const fam of FAMILIES) {
  const list = [];
  for (const c of catalog) {
    if (!fam.re.test(c.name) || SKIP_RE.test(c.name)) continue;
    list.push({ id: c.id, name: friendly(c.name), ed: c.name, role: roleOf(c.name), tier: tierOf(c.name) });
  }
  familyVariants.set(fam.key, list);
}
const familySummary = () => FAMILIES.filter((f) => familyVariants.get(f.key).length > 0).map((f) => {
  const list = familyVariants.get(f.key);
  const roles = [...new Set(list.map((v) => v.role))];
  const tiers = [...new Set(list.map((v) => v.tier).filter(Boolean))];
  return { key: f.key, name: f.name, icon: f.icon, group: f.group, count: list.length, roles, tiers };
});

// ---------------------------------------------------------------------------
// Doğurma ve temizleme
// ---------------------------------------------------------------------------

const spawnedBy = new Map(); // actorId -> [refId]
const spawnedBase = new Map(); // refId -> baseId

// Doğurulan yaratıklar veritabanına kalıcı yazılıyor; restart sonrası kendiliğinden
// geri gelmesinler diye id'leri dosyada tutulur ve açılışta hepsi kaldırılır.
const SPAWNED_FILE = process.cwd() + '/sotr-admin-spawned.json';
const loadSpawnedIds = () => { try { return JSON.parse(fs.readFileSync(SPAWNED_FILE, 'utf8')); } catch (e) { return []; } };
const saveSpawnedIds = (ids) => { try { fs.writeFileSync(SPAWNED_FILE, JSON.stringify(ids)); } catch (e) { /* yoksay */ } };
if (!globalThis.sotrStaleCleared) {
  globalThis.sotrStaleCleared = true;
  const stale = loadSpawnedIds();
  for (const ref of stale) {
    try { mp.set(ref, 'isDisabled', true); } catch (e) { /* zaten gitmiş */ }
  }
  if (stale.length) console.log(`[sotr-admin] açılışta ${stale.length} eski yaratık kaldırıldı`);
  saveSpawnedIds([]);
}

const isAdmin = (actor) => {
  if (ADMIN_PROFILE_IDS.length === 0) return true;
  let pid;
  try { pid = mp.get(actor, 'profileId'); } catch (e) { return false; }
  return ADMIN_PROFILE_IDS.includes(pid);
};

const placeNear = (actor, baseIds) => {
  const loc = mp.get(actor, 'locationalData');
  const a = (loc.rot[2] * Math.PI) / 180;
  const list = spawnedBy.get(actor) || [];
  const count = baseIds.length;
  const placed = [];
  baseIds.forEach((baseId, i) => {
    const side = (i - (count - 1) / 2) * 200;
    const pos = [
      loc.pos[0] + Math.sin(a) * 600 + Math.cos(a) * side,
      loc.pos[1] + Math.cos(a) * 600 - Math.sin(a) * side,
      loc.pos[2] + 50,
    ];
    const ref = mp.place(baseId);
    mp.set(ref, 'locationalData', { cellOrWorldDesc: loc.cellOrWorldDesc, pos, rot: [0, 0, loc.rot[2] + 180] });
    spawnedBase.set(ref, baseId);
    list.push(ref);
    placed.push(ref);
  });
  spawnedBy.set(actor, list);
  saveSpawnedIds(loadSpawnedIds().concat(placed));
  return placed;
};

const pickVariants = (familyKey, role, tier, n) => {
  let list = familyVariants.get(familyKey) || [];
  if (role && role !== 'any') list = list.filter((v) => v.role === role);
  if (tier && tier !== 'any') list = list.filter((v) => v.tier === tier);
  if (list.length === 0) return [];
  const out = [];
  for (let i = 0; i < n; i++) out.push(list[Math.floor(Math.random() * list.length)]);
  return out;
};

const clearSpawned = (actor) => {
  const list = spawnedBy.get(actor) || [];
  for (const ref of list) {
    try { mp.set(ref, 'isDisabled', true); } catch (e) { /* zaten gitmiş */ }
  }
  spawnedBy.set(actor, []);
  saveSpawnedIds(loadSpawnedIds().filter((id) => !list.includes(id)));
  return list.length;
};

const clearAllSpawned = () => {
  const ids = loadSpawnedIds();
  for (const ref of ids) {
    try { mp.set(ref, 'isDisabled', true); } catch (e) { /* zaten gitmiş */ }
  }
  spawnedBy.clear();
  saveSpawnedIds([]);
  return ids.length;
};

// F7 ile doğurulan yaratıklar ölünce yeniden doğmasın (SkyMP varsayılanı 25 sn sonra diriltir).
// Ceset CORPSE_SECONDS boyunca yerde kalır, sonra kaldırılır.
const CORPSE_SECONDS = 300;
const RESPAWN_DELAY_SECONDS = 25;
mp.onRespawn = (actorId) => {
  const ids = loadSpawnedIds();
  if (!ids.includes(actorId)) return true;
  const removeCorpse = () => {
    try { mp.set(actorId, 'isDisabled', true); } catch (e) { /* yoksay */ }
    saveSpawnedIds(loadSpawnedIds().filter((id) => id !== actorId));
    for (const [owner, list] of spawnedBy) spawnedBy.set(owner, list.filter((id) => id !== actorId));
    console.log(`[sotr-admin] ${actorId.toString(16)} cesedi kaldırıldı`);
  };
  setTimeout(removeCorpse, Math.max(0, CORPSE_SECONDS - RESPAWN_DELAY_SECONDS) * 1000);
  console.log(`[sotr-admin] ${actorId.toString(16)} öldü, yeniden doğmayacak; ceset ~${CORPSE_SECONDS} sn sonra kalkacak`);
  return false;
};

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
// Perk ağaçlarındaki tüm perkler: Skyrim.esm AVIF kayıtlarının PNAM alanları (istemci sahipliği hasPerk ile süzer)
const TREE_PERKS = (() => {
  const out = [];
  for (let id = 0x3e8; id < 0x600; id++) {
    const rec = recordOf(id);
    if (!rec || !/^AV/.test(rec.editorId || '')) continue;
    for (const f of rec.fields || []) {
      if (f.type === 'PNAM' && f.data.length >= 4) {
        const perk = u32(f.data, 0);
        if (perk && !out.includes(perk)) out.push(perk);
      }
    }
  }
  return out;
})();
console.log(`[sotr] perk ağaçları: ${TREE_PERKS.length} perk`);
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

// NPC'nin temel canı, sunucunun GetBaseActorValues hesabıyla aynı: ırk başlangıç canı + ACBS can farkı.
// Şablon zinciri (templateChain) UseTraits (0x01) ve UseStats (0x02) bayraklarına göre izlenir.
const f32 = (d, o) => Buffer.from(d.slice(o, o + 4)).readFloatLE(0);
const s16 = (d, o) => { const v = u16(d, o); return v & 0x8000 ? v - 0x10000 : v; };
const evalTemplate = (chain, flag) => {
  for (const id of chain) {
    const rec = recordOf(id);
    const acbs = fieldOf(rec, 'ACBS');
    if (!acbs || acbs.data.length < 22) return null;
    if (!fieldOf(rec, 'TPLT') || !(u16(acbs.data, 18) & flag)) return rec;
  }
  return null;
};
const npcHealth = (ref) => {
  let chain = [];
  try { chain = (mp.get(ref, 'templateChain') || []).map((x) => x >>> 0); } catch (e) { /* yok */ }
  return healthOfChain(chain.length ? chain : [baseIdOf(ref)]);
};
const healthOfChain = (chain) => {
  try {
    const traits = evalTemplate(chain, 0x01);
    const stats = evalTemplate(chain, 0x02);
    const rnam = fieldOf(traits, 'RNAM');
    const race = rnam ? recordOf(u32(rnam.data, 0)) : null;
    const data = fieldOf(race, 'DATA');
    if (!stats || !data || data.data.length < 40) return 0;
    const hp = f32(data.data, 36) + s16(fieldOf(stats, 'ACBS').data, 20);
    return hp > 0 ? hp : 0;
  } catch (e) {
    return 0;
  }
};

const XP_SHARE_RANGE = 4000;
// Genel XP hızı (2026-10-02, Burak: "her şey çok XP veriyor"): level 1'de ~20 kurt ya da ~7 draugr bir level eder
// 2026-10-02 (Burak: "draugr ile skeever aynı XP'yi veriyor"): XP yaratığın canından; seviye kayıtları güç göstermiyor.
// Can: skeever ~12, kurt ~25, draugr ~90, ayı ~200, ejderha 1000+. Level 1'de ~12 kurt ya da ~5 draugr bir level eder.
const XP_RATE = 1;
const killXp = (victimHp, victimLvl) => {
  const base = victimHp > 0 ? 3 + victimHp / 5 : (5 + victimLvl * 2) * 0.5;
  return base * XP_RATE;
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
      const hp = npcHealth(victim);
      const amount = killXp(hp, vl) * share;
      grantXp(p, amount, share < 1 ? 'grup' : '');
      console.log(`[sotr-prog] ${actorName(p)} ${victim.toString(16)} (can ${Math.round(hp)}, seviye ${vl}) için ${amount.toFixed(1)} XP aldı`);
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
    // Sıfırlama listesi: sotr-reset.json'daki profileId'ler bir sonraki girişte sıfırdan başlar (bir kerelik)
    let pid = -1;
    try { pid = mp.get(actor, 'profileId'); } catch (e) { /* yok */ }
    try {
      const file = process.cwd() + '/sotr-reset.json';
      const list = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(list) && list.includes(pid)) {
        prog = null;
        fs.writeFileSync(file, JSON.stringify(list.filter((x) => x !== pid)));
        console.log(`[sotr-prog] ${actorName(actor)} (profileId ${pid}) sıfırlandı`);
      }
    } catch (e) { /* liste yok */ }
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

// ---------------------------------------------------------------------------
// Yönetici paneli: sunucu tarafı işlemler
// ---------------------------------------------------------------------------

const STARTED_AT = globalThis.sotrStartedAt || (globalThis.sotrStartedAt = Date.now());
let adminSeq = 0;
const sendAdmin = (actor, payload) => {
  try { mp.set(actor, 'sotrAdminData', Object.assign({ seq: ++adminSeq }, payload)); } catch (e) { /* yoksay */ }
};

const playerInfo = (p) => {
  const prog = getProg(p) || {};
  let hp = 1;
  let dead = false;
  try { hp = mp.get(p, 'percentages').health; } catch (e) { /* yok */ }
  try { dead = mp.get(p, 'isDead'); } catch (e) { /* yok */ }
  return {
    id: p, name: tagOf(p) + ' ' + actorName(p), lvl: prog.lvl || 1, xp: Math.round(prog.xp || 0), need: xpForLevel(prog.lvl || 1),
    pp: prog.pp || 0, sp: prog.sp || 0, hp: Math.round(hp * 100), dead,
  };
};
const serverStats = () => ({
  online: onlinePlayers().length,
  spawned: loadSpawnedIds().length,
  uptimeMin: Math.round((Date.now() - STARTED_AT) / 60000),
});

const offsetFrom = (loc, dist) => {
  const a = (loc.rot[2] * Math.PI) / 180;
  return { cellOrWorldDesc: loc.cellOrWorldDesc, pos: [loc.pos[0] + Math.sin(a) * dist, loc.pos[1] + Math.cos(a) * dist, loc.pos[2] + 20], rot: [0, 0, loc.rot[2] + 180] };
};

const playerAction = (actor, target, action, amount) => {
  if (!onlinePlayers().includes(target)) return 'Oyuncu çevrimiçi değil.';
  const name = actorName(target);
  switch (action) {
    case 'goto':
      mp.set(actor, 'locationalData', offsetFrom(mp.get(target, 'locationalData'), 150));
      return `${name} yanına gidildi.`;
    case 'bring':
      mp.set(target, 'locationalData', offsetFrom(mp.get(actor, 'locationalData'), 150));
      return `${name} yanına çekildi.`;
    case 'heal':
      if (mp.get(target, 'isDead')) mp.set(target, 'isDead', false);
      mp.set(target, 'percentages', { health: 1, magicka: 1, stamina: 1 });
      notify(target, 'Bir yönetici seni iyileştirdi.');
      return `${name} iyileştirildi.`;
    case 'kill':
      mp.set(target, 'isDead', true);
      return `${name} öldürüldü.`;
    case 'xp': {
      const n = Math.max(1, Math.min(100000, amount | 0));
      grantXp(target, n, 'yönetici');
      return `${name} oyuncusuna ${n} XP verildi.`;
    }
    case 'level': {
      const prog = getProg(target);
      if (!prog) return 'Oyuncunun ilerleme kaydı yok.';
      const need = xpForLevel(prog.lvl) - prog.xp;
      grantXp(target, Math.max(1, Math.ceil(need)), 'yönetici');
      return `${name} bir level atlayabilir (Beceriler menüsünden).`;
    }
    case 'resetPerks': {
      const prog = getProg(target);
      if (!prog) return 'Oyuncunun ilerleme kaydı yok.';
      prog.pp += prog.perks.length;
      prog.perks = [];
      saveProg(target, prog);
      notify(target, 'Perklerin sıfırlandı; puanlar iade edildi.');
      return `${name} perkleri sıfırlandı.`;
    }
    case 'resetSkills': {
      const prog = getProg(target);
      if (!prog) return 'Oyuncunun ilerleme kaydı yok.';
      const base = prog.base || newProg(null).skills;
      let refund = 0;
      for (const id of SKILL_IDS) refund += Math.max(0, prog.skills[id] - base[id]);
      prog.skills = base;
      prog.sp += refund;
      saveProg(target, prog);
      notify(target, `Becerilerin sıfırlandı; ${refund} puan iade edildi.`);
      return `${name} becerileri sıfırlandı (${refund} puan iade).`;
    }
    default:
      return 'Bilinmeyen işlem.';
  }
};

mp._onSotrAdmin = (actor, msg) => {
  let pid;
  try { pid = mp.get(actor, 'profileId'); } catch (e) { /* yok */ }
  if (!isAdmin(actor)) {
    console.log(`[sotr-admin] reddedildi: aktör ${actor.toString(16)} profileId ${pid}`);
    return;
  }
  if (!msg) return;
  try {
    switch (msg.op) {
      case 'init':
        sendAdmin(actor, { type: 'init', families: familySummary(), roleNames: ROLE_NAMES, tierNames: TIER_NAMES, players: onlinePlayers().map(playerInfo), stats: serverStats(), me: actor });
        break;
      case 'variants':
        sendAdmin(actor, { type: 'variants', family: msg.family, items: (familyVariants.get(msg.family) || []).map((v) => ({ id: v.id, name: v.name, role: v.role, tier: v.tier })) });
        break;
      case 'spawn': {
        const n = Math.max(1, Math.min(MAX_COUNT, msg.n | 0));
        let picks;
        if (msg.id) {
          const v = (familyVariants.get(msg.family) || []).find((x) => x.id === msg.id);
          picks = v ? Array(n).fill(v) : [];
        } else {
          picks = pickVariants(msg.family, msg.role, msg.tier, n);
        }
        if (picks.length === 0) {
          sendAdmin(actor, { type: 'toast', text: 'Bu seçime uyan yaratık yok.' });
          break;
        }
        placeNear(actor, picks.map((v) => v.id));
        console.log(`[sotr-admin] ${actorName(actor)} (profileId ${pid}) doğurdu: ${picks.map((v) => v.ed).join(', ')}`);
        sendAdmin(actor, { type: 'toast', text: `${picks.length} yaratık doğdu: ${[...new Set(picks.map((v) => v.name))].slice(0, 3).join(', ')}` });
        break;
      }
      case 'clear':
        sendAdmin(actor, { type: 'toast', text: `${clearSpawned(actor)} yaratığın temizlendi.` });
        break;
      case 'clearAll':
        sendAdmin(actor, { type: 'toast', text: `Sunucudaki ${clearAllSpawned()} doğurulmuş yaratık temizlendi.` });
        console.log(`[sotr-admin] ${actorName(actor)} tüm doğurulmuşları temizledi`);
        break;
      case 'players':
        sendAdmin(actor, { type: 'players', players: onlinePlayers().map(playerInfo), stats: serverStats() });
        break;
      case 'player': {
        const text = playerAction(actor, msg.target >>> 0, msg.action, msg.amount);
        console.log(`[sotr-admin] ${actorName(actor)}: ${msg.action} -> ${actorName(msg.target >>> 0)}: ${text}`);
        sendAdmin(actor, { type: 'toast', text });
        sendAdmin(actor, { type: 'players', players: onlinePlayers().map(playerInfo), stats: serverStats() });
        break;
      }
      case 'announce': {
        const text = `${msg.text || ''}`.trim().slice(0, 200);
        if (!text) break;
        for (const p of onlinePlayers()) notify(p, `📢 ${text}`);
        console.log(`[sotr-admin] duyuru (${actorName(actor)}): ${text}`);
        sendAdmin(actor, { type: 'toast', text: 'Duyuru gönderildi.' });
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.log('[sotr-admin] hata', e && e.message);
    sendAdmin(actor, { type: 'toast', text: 'Hata: ' + (e && e.message) });
  }
};

mp._onSotrProg = (actor, msg) => {
  try { onProgEvent(actor, msg); } catch (e) { console.log('[sotr-prog] hata', e && e.message); }
};

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
    sp.UI.invokeIntA(LEVELUP, CALL + 'setSkillCaps', SKILLS.map(() => cfg.skillMax));
    // [kullanılmıyor, bir becerinin level başına en çok artışı, puan, maliyetler 0-25/25-50/50-75/75+]
    sp.UI.invokeIntA(LEVELUP, CALL + 'setLevelingSettings', [-1, cfg.skillMax, menuSp, 1, 1, 1, 1]);
    sp.UI.invokeForm(LEVELUP, CALL + 'setPlayer', player());
  };
  sp.on('modEvent', (e) => {
    if (e.eventName !== 'SSL_SkillsDistributionCompleted') return;
    const diffs = ('' + e.strArg).split(';').map((x) => Math.max(0, parseInt(x, 10) || 0));
    SKILLS.forEach((_, i) => { spent[i] += diffs[i] || 0; });
    menuSp = Math.max(0, Math.round(e.numArg));
    log('level ekranı dağıtımı: ' + diffs.join(';') + ' kalan ' + menuSp);
  });

  const MENUS = ['StatsMenu', LEVELUP];
  sp.on('menuOpen', (e) => {
    if (MENUS.indexOf(e.name) >= 0) menuOpen = true;
    if (e.name === LEVELUP) {
      const p = prog();
      menuSp = (menuSp === null ? (p ? p.sp : 0) : menuSp) + cfg.pointsPerLevel;
      const now = Date.now();
      feedAt = [now + 30, now + 150, now + 400, now + 800];
    }
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

// ---------------------------------------------------------------------------
// Sesli sohbet: LiveKit (VDS, nginx /voice) + tarayıcıda Web Audio ile 3B ses.
// - Bas-konuş V, mod değiştir B: fısıltı 3 m, normal 20 m, bağırma 55 m.
// - Mesafeyle sönüm, HRTF yönlü ses, görüş hattı yoksa boğuk (alçak geçiren filtre),
//   iç mekânda yankı; mağara, mezar ve madenlerde uzun yankı.
// Anahtar dosyası /srv/skymp/server/sotr-voice.json (git'te yok).
// ---------------------------------------------------------------------------

const crypto = require('crypto');
const VOICE_FILE = process.cwd() + '/sotr-voice.json';
let voiceCfg = null;
try { voiceCfg = JSON.parse(fs.readFileSync(VOICE_FILE, 'utf8')); } catch (e) { console.log('[sotr-voice] yapılandırma yok, sesli sohbet kapalı'); }

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const voiceToken = (identity, name) => {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({
    iss: voiceCfg.key, sub: identity, name, nbf: now - 10, exp: now + 12 * 3600,
    video: { room: 'sotr', roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false, canUpdateOwnMetadata: true },
  }));
  const sig = b64url(crypto.createHmac('sha256', voiceCfg.secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
};

// Kimlik = "#1234"; komşunun isim etiketinden (sotrTag) aynı kimlik okunur, konum eşleşir.
const voiceIssued = new Map();
every(3000, () => {
  if (!voiceCfg) return;
  for (const actor of onlinePlayers()) {
    const id = tagOf(actor);
    const prev = voiceIssued.get(actor);
    if (prev && prev.id === id && Date.now() - prev.t < 6 * 3600000) continue;
    voiceIssued.set(actor, { id, t: Date.now() });
    try { mp.set(actor, 'sotrVoice', { seq: Date.now(), url: voiceCfg.url, token: voiceToken(id, actorName(actor)) }); } catch (e) { /* yoksay */ }
  }
});

// --- İstemci tarafı --------------------------------------------------------

/* eslint-disable no-var */
function sotrVoicePanel(cfg) {
  if (window.sotrVoice && window.sotrVoice.token === cfg.token) return;
  if (window.sotrVoice && window.sotrVoice.room) { try { window.sotrVoice.room.disconnect(); } catch (e) { /* */ } }
  var V = window.sotrVoice = { token: cfg.token, peers: {}, mode: 'normal', talking: false, env: 'out', ready: false };
  var MODES = { whisper: { r: 210, g: 0.55, n: 'Fısıltı' }, normal: { r: 1400, g: 1, n: 'Normal' }, shout: { r: 3850, g: 1.35, n: 'Bağırma' } };
  var UNIT = 70; // Skyrim birimi → metre

  // Gösterge
  if (!document.getElementById('sotr-voice')) {
    var el = document.createElement('div');
    el.id = 'sotr-voice';
    el.innerHTML = '<style>#sotr-voice{position:fixed;left:24px;bottom:84px;z-index:99991;font:13px "Segoe UI",sans-serif;color:#eadfc8;text-shadow:0 0 3px #000;pointer-events:none;padding:4px 10px;border-radius:14px;background:rgba(10,8,6,.45)}'
      + '#sotr-voice.on{background:rgba(60,110,50,.75);color:#fff}#sotr-voice.err{background:rgba(110,40,30,.7)}</style><span></span>';
    document.body.appendChild(el);
  }
  var hud = document.getElementById('sotr-voice');
  var drawHud = function (err) {
    hud.className = err ? 'err' : (V.talking ? 'on' : '');
    hud.querySelector('span').textContent = err ? ('🎤 ' + err) : ('🎤 ' + MODES[V.mode].n + (V.talking ? ' — konuşuyorsun' : ' · V bas-konuş · B mod'));
  };
  drawHud('bağlanıyor…');

  var ctx = new (window.AudioContext || window.webkitAudioContext)();
  var master = ctx.createGain();
  master.connect(ctx.destination);
  // Yankı: gürültüden üretilmiş sönümlü dürtü yanıtı
  var makeIR = function (sec, decay) {
    var len = Math.floor(ctx.sampleRate * sec);
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  };
  var ENV = { out: { wet: 0.0, ir: null }, room: { wet: 0.18, ir: makeIR(0.9, 3) }, cave: { wet: 0.42, ir: makeIR(2.8, 2.2) } };
  var reverb = ctx.createConvolver();
  var wet = ctx.createGain();
  wet.gain.value = 0;
  reverb.connect(wet);
  wet.connect(master);
  var setEnv = function (env) {
    if (V.env === env) return;
    V.env = env;
    if (ENV[env].ir) reverb.buffer = ENV[env].ir;
    wet.gain.setTargetAtTime(ENV[env].wet, ctx.currentTime, 0.3);
  };

  var attach = function (track, participant) {
    var id = participant.identity;
    var ms = new MediaStream([track.mediaStreamTrack]);
    // Chromium: uzak WebRTC akışı ancak bir <audio> öğesine bağlıyken Web Audio'ya akar
    var a = new Audio();
    a.srcObject = ms;
    a.muted = true;
    a.play().catch(function () {});
    var src = ctx.createMediaStreamSource(ms);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 20000;
    var gain = ctx.createGain();
    gain.gain.value = 0;
    var pan = ctx.createPanner();
    pan.panningModel = 'HRTF';
    pan.distanceModel = 'linear';
    pan.refDistance = 1;
    pan.maxDistance = 10000;
    pan.rolloffFactor = 0; // sönümü kendimiz hesaplıyoruz
    var send = ctx.createGain();
    send.gain.value = 1;
    src.connect(lp); lp.connect(gain); gain.connect(pan); pan.connect(master); pan.connect(send); send.connect(reverb);
    V.peers[id] = { a: a, src: src, lp: lp, gain: gain, pan: pan, participant: participant };
  };
  var detach = function (participant) {
    var p = V.peers[participant.identity];
    if (!p) return;
    try { p.src.disconnect(); p.pan.disconnect(); p.a.srcObject = null; } catch (e) { /* */ }
    delete V.peers[participant.identity];
  };

  var start = function () {
    var LK = window.LivekitClient;
    var room = V.room = new LK.Room({ adaptiveStream: false, dynacast: false, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    room.on(LK.RoomEvent.TrackSubscribed, function (track, pub, participant) { if (track.kind === 'audio') attach(track, participant); });
    room.on(LK.RoomEvent.TrackUnsubscribed, function (track, pub, participant) { detach(participant); });
    room.on(LK.RoomEvent.ParticipantDisconnected, detach);
    room.on(LK.RoomEvent.Disconnected, function () { V.ready = false; drawHud('bağlantı koptu'); });
    // Eski SkyrimPlatformImpl.dll'de CEF mikrofonu açmaz (navigator.mediaDevices yok): yalnız dinle
    var canMic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    room.connect(cfg.url, cfg.token, { autoSubscribe: true }).then(function () {
      return canMic ? room.localParticipant.setMicrophoneEnabled(true) : null;
    }).then(function () {
      V.mic = canMic ? room.localParticipant.getTrackPublication(LK.Track.Source.Microphone) : null;
      if (V.mic && V.mic.track) V.mic.track.mute();
      room.localParticipant.setAttributes({ mode: V.mode });
      V.ready = true;
      V.noMic = !canMic;
      drawHud(canMic ? null : 'mikrofon yok · yalnız dinleme');
    }).catch(function (e) { drawHud('hata: ' + (e && e.message ? e.message : e)); });
  };
  if (window.LivekitClient) start();
  else {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js';
    s.onload = start;
    s.onerror = function () { drawHud('ses kütüphanesi yüklenemedi'); };
    document.head.appendChild(s);
  }

  window.sotrVoiceTalk = function (on) {
    if (!V.ready || V.noMic || V.talking === on) return;
    V.talking = on;
    if (ctx.state === 'suspended') ctx.resume();
    if (V.mic && V.mic.track) { if (on) V.mic.track.unmute(); else V.mic.track.mute(); }
    drawHud();
  };
  window.sotrVoiceMode = function () {
    V.mode = V.mode === 'normal' ? 'shout' : V.mode === 'shout' ? 'whisper' : 'normal';
    if (V.room && V.ready) V.room.localParticipant.setAttributes({ mode: V.mode });
    drawHud(V.noMic ? 'mikrofon yok · yalnız dinleme' : null);
  };
  // Oyundan her ~100 ms: dinleyici konumu/yönü, ortam, komşuların konumu ve görüş hattı
  window.sotrVoiceTick = function (t) {
    if (!V.ready) return;
    if (ctx.state === 'suspended') ctx.resume();
    setEnv(t.env);
    var L = ctx.listener;
    var a = t.me.a * Math.PI / 180;
    var set = function (p, v) { if (p) p.setTargetAtTime(v, ctx.currentTime, 0.05); };
    // Skyrim (x doğu, y kuzey, z yukarı) → Web Audio (x sağ, y yukarı, -z ileri)
    var lx = t.me.x / UNIT, ly = t.me.z / UNIT, lz = -t.me.y / UNIT;
    if (L.positionX) { set(L.positionX, lx); set(L.positionY, ly); set(L.positionZ, lz); set(L.forwardX, Math.sin(a)); set(L.forwardY, 0); set(L.forwardZ, -Math.cos(a)); set(L.upX, 0); set(L.upY, 1); set(L.upZ, 0); }
    else { L.setPosition(lx, ly, lz); L.setOrientation(Math.sin(a), 0, -Math.cos(a), 0, 1, 0); }
    Object.keys(V.peers).forEach(function (id) {
      var p = V.peers[id];
      var n = t.peers[id];
      var mode = MODES[(p.participant.attributes && p.participant.attributes.mode) || 'normal'] || MODES.normal;
      var g = 0;
      if (n) {
        var d = Math.sqrt(Math.pow(n.x - t.me.x, 2) + Math.pow(n.y - t.me.y, 2) + Math.pow(n.z - t.me.z, 2));
        if (d < mode.r) g = mode.g * Math.pow(1 - d / mode.r, 1.6);
        if (!n.los) g *= 0.45;
        set(p.pan.positionX, n.x / UNIT); set(p.pan.positionY, n.z / UNIT); set(p.pan.positionZ, -n.y / UNIT);
        p.lp.frequency.setTargetAtTime(n.los ? 20000 : 700, ctx.currentTime, 0.08);
      }
      p.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.06);
    });
  };
}

function sotrVoiceClient(ctx) {
  if (ctx.state.sotrVoiceInit) return;
  ctx.state.sotrVoiceInit = true;
  const sp = ctx.sp;
  const V_KEY = 0x2f;
  const B_KEY = 0x30;
  let vDown = false;
  let bDown = false;
  let last = 0;
  const CAVE = ['LocTypeDungeon', 'LocTypeDraugrCrypt', 'LocTypeCave', 'LocTypeMine', 'LocTypeAnimalDen', 'LocTypeDwarvenAutomatons', 'LocTypeFalmerHive'];
  let caveKws = null;
  let envCache = { cell: 0, env: 'out' };
  const envOf = (pl) => {
    const cell = pl.getParentCell();
    if (!cell || !cell.isInterior()) return 'out';
    if (envCache.cell === cell.getFormID()) return envCache.env;
    if (!caveKws) caveKws = CAVE.map((k) => sp.Keyword.getKeyword(k)).filter((k) => k);
    const loc = pl.getCurrentLocation();
    const env = loc && caveKws.some((k) => loc.hasKeyword(k)) ? 'cave' : 'room';
    envCache = { cell: cell.getFormID(), env };
    return env;
  };

  sp.on('update', () => {
    const typing = sp.browser.isFocused();
    const v = !typing && sp.Input.isKeyPressed(V_KEY);
    if (v !== vDown) { vDown = v; sp.browser.executeJavaScript('window.sotrVoiceTalk && window.sotrVoiceTalk(' + v + ')'); }
    const b = !typing && sp.Input.isKeyPressed(B_KEY);
    if (b && !bDown) sp.browser.executeJavaScript('window.sotrVoiceMode && window.sotrVoiceMode()');
    bDown = b;

    const now = Date.now();
    if (now - last < 100) return;
    last = now;
    const pl = sp.Game.getPlayer();
    if (!pl) return;
    const peers = {};
    const map = sp.storage['sotrVoicePeers'] || {};
    for (const id of Object.keys(map)) {
      if (now - map[id].t < 1500) peers[id] = map[id];
    }
    const t = { env: envOf(pl), me: { x: pl.getPositionX(), y: pl.getPositionY(), z: pl.getPositionZ() + 110, a: pl.getAngleZ() }, peers };
    sp.browser.executeJavaScript('window.sotrVoiceTick && window.sotrVoiceTick(' + JSON.stringify(t) + ')');
  });
}

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

// ---------------------------------------------------------------------------
// Ganimet: ölen yaratığın cesedine aileye ve seviyeye göre eşya eklenir.
// Satır biçimi: [eşya formId, şans 0-1, en az, en çok]
// ---------------------------------------------------------------------------

const I = {
  gold: 0xf, lockpick: 0xa,
  wolfPelt: 0x3ad74, bearPelt: 0x3ad52, bearCavePelt: 0x3ad53, bearSnowPelt: 0x3ad54, sabrePelt: 0x3ad6d, sabreSnowPelt: 0x3ad6e,
  deerHide: 0x3ad90, leather: 0xdb5d2, leatherStrips: 0x800e4, mammothTusk: 0x3ad6c,
  dogMeat: 0xedb2e, venison: 0x669a2, horkerMeat: 0x65c9b, mammothMeat: 0x669a4,
  trollFat: 0x3ad72, bearClaws: 0x6bc02, spiderEgg: 0x9151b, frostbiteVenom: 0xe41b8, skeeverTail: 0x3ad6f, chaurusEggs: 0x3ad56,
  giantToes: 0x3ad64, hagFeathers: 0x3ad66, hagClaw: 0x6b689, boneMeal: 0x34cdd, iceWraithTeeth: 0x3ad6a,
  fireSalts: 0x3ad5e, frostSalts: 0x3ad5f, voidSalts: 0x3ad60, daedraHeart: 0x3ad5b, dwarvenOil: 0xf11c0,
  dragonBone: 0x3ada4, dragonScales: 0x3ada3,
  hp1: 0x3eadd, hp2: 0x3eade, mp1: 0x3eae0, st1: 0x3eae5,
  ironArrow: 0x1397d, steelArrow: 0x1397f, dwarvenArrow: 0x139bc, ebonyArrow: 0x139bf,
  sgPetty: 0x2e4e2, sgLesser: 0x2e4e4, sgCommon: 0x2e4e6, sgGreater: 0x2e4f4, sgGrand: 0x2e4fc, sgBlack: 0x2e500,
  ingotIron: 0x5ace4, ingotSteel: 0x5ace5, ingotCorundum: 0x5ad93, ingotOrichalcum: 0x5ad99, ingotEbony: 0x5ad9d, ingotGold: 0x5ad9e, ingotQuicksilver: 0x5ada0,
  amethyst: 0x63b46, garnet: 0x63b45, ruby: 0x63b42, sapphire: 0x63b44, emerald: 0x63b43, diamond: 0x63b47, flawlessDiamond: 0x6851f,
  ringSilver: 0x3b97c, ringGold: 0x1cf2b, neckSilver: 0x9171b, neckGold: 0x877d5,
  elvenSword: 0x139a1, elvenBow: 0x1399d, glassSword: 0x139a9, glassBow: 0x139a5, ebonySword: 0x139b1, ebonyBow: 0x139ad, ebonyWarAxe: 0x139ab,
  daedricSword: 0x139b9, daedricBow: 0x139b5,
};

// Aileye özgü düşüşler (hayvan parçaları, simya malzemeleri)
const FAMILY_LOOT = {
  wolf: [[I.wolfPelt, 0.9, 1, 1], [I.dogMeat, 0.5, 1, 1]],
  bear: [[I.bearPelt, 0.9, 1, 1], [I.bearClaws, 0.7, 1, 2], [I.venison, 0.4, 1, 1]],
  sabre: [[I.sabrePelt, 0.9, 1, 1], [I.venison, 0.4, 1, 1]],
  troll: [[I.trollFat, 0.9, 1, 2]],
  spider: [[I.frostbiteVenom, 0.8, 1, 2], [I.spiderEgg, 0.4, 1, 2]],
  skeever: [[I.skeeverTail, 0.9, 1, 1]],
  chaurus: [[I.chaurusEggs, 0.9, 1, 3]],
  horker: [[I.horkerMeat, 0.9, 1, 2]],
  mammoth: [[I.mammothTusk, 0.9, 1, 2], [I.mammothMeat, 0.9, 1, 2]],
  giant: [[I.giantToes, 0.9, 1, 1], [I.gold, 1, 30, 120]],
  deer: [[I.deerHide, 0.9, 1, 1], [I.venison, 0.8, 1, 2]],
  hagraven: [[I.hagFeathers, 0.9, 1, 2], [I.hagClaw, 0.6, 1, 1]],
  atronach: [[I.fireSalts, 0.5, 1, 1], [I.frostSalts, 0.5, 1, 1]],
  dremora: [[I.daedraHeart, 0.25, 1, 1], [I.voidSalts, 0.3, 1, 1]],
  wisp: [[I.iceWraithTeeth, 0.6, 1, 2]],
  dwarven: [[I.dwarvenOil, 0.8, 1, 2], [I.dwarvenArrow, 0.3, 3, 8], [I.sgCommon, 0.2, 1, 1]],
  draugr: [[I.boneMeal, 0.5, 1, 2]],
  skeleton: [[I.boneMeal, 0.7, 1, 2]],
  dragon: [[I.dragonBone, 1, 2, 3], [I.dragonScales, 1, 2, 3], [I.gold, 1, 200, 500], [I.flawlessDiamond, 0.3, 1, 1]],
};

// Altın ve genel ganimet alan (akıllı/silahlı) aileler
const HUMANOID = new Set(['bandit', 'warlock', 'forsworn', 'thalmor', 'alikr', 'witch', 'vigilant', 'hunter', 'vampire', 'falmer', 'draugr', 'dragonpriest', 'dremora']);

// Seviyeye göre kademeli tablolar: her kademeden bir zar
const TIER_TABLES = [
  { min: 1, chance: 0.6, items: [[I.hp1, 1, 1], [I.mp1, 1, 1], [I.st1, 1, 1], [I.lockpick, 1, 3], [I.ironArrow, 4, 10], [I.sgPetty, 1, 1], [I.ingotIron, 1, 2], [I.leatherStrips, 1, 3]] },
  { min: 8, chance: 0.35, items: [[I.hp2, 1, 1], [I.steelArrow, 4, 10], [I.sgLesser, 1, 1], [I.ingotSteel, 1, 2], [I.amethyst, 1, 1], [I.garnet, 1, 1], [I.ringSilver, 1, 1], [I.ingotCorundum, 1, 2]] },
  { min: 16, chance: 0.18, items: [[I.sgCommon, 1, 1], [I.ingotOrichalcum, 1, 2], [I.ingotQuicksilver, 1, 1], [I.ruby, 1, 1], [I.sapphire, 1, 1], [I.neckSilver, 1, 1], [I.ringGold, 1, 1], [I.elvenSword, 1, 1], [I.elvenBow, 1, 1]] },
  { min: 26, chance: 0.08, items: [[I.sgGreater, 1, 1], [I.emerald, 1, 1], [I.diamond, 1, 1], [I.ingotEbony, 1, 1], [I.neckGold, 1, 1], [I.ingotGold, 1, 2]] },
];
// Peşine düşülen nadir düşüşler (%1'in altı; boss'larda 3 kat)
const CHASE = [
  { min: 12, chance: 0.006, items: [[I.glassSword, 1, 1], [I.glassBow, 1, 1]] },
  { min: 22, chance: 0.004, items: [[I.ebonySword, 1, 1], [I.ebonyBow, 1, 1], [I.ebonyWarAxe, 1, 1], [I.ebonyArrow, 5, 12]] },
  { min: 34, chance: 0.002, items: [[I.daedricSword, 1, 1], [I.daedricBow, 1, 1], [I.sgBlack, 1, 1]] },
];

const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const familyOfRef = (ref) => {
  const rec = recordOf(baseIdOf(ref));
  const ed = (rec && rec.editorId) || '';
  const fam = FAMILIES.find((f) => f.re.test(ed));
  return { key: fam ? fam.key : '', ed };
};

const rollLoot = (famKey, lvl, boss) => {
  const out = [];
  for (const [id, chance, a, b] of FAMILY_LOOT[famKey] || []) {
    if (Math.random() < chance) out.push([id, rint(a, b)]);
  }
  if (!HUMANOID.has(famKey)) return { out, rare: false };
  const goldMult = famKey === 'draugr' || famKey === 'falmer' ? 1 : 3;
  out.push([I.gold, rint(lvl, lvl * goldMult + 10)]);
  for (const t of TIER_TABLES) {
    if (lvl >= t.min && Math.random() < t.chance * (boss ? 2 : 1)) {
      const [id, a, b] = pick(t.items);
      out.push([id, rint(a, b)]);
    }
  }
  if (boss) out.push([pick([I.amethyst, I.garnet, I.ruby, I.sapphire]), 1], [lvl >= 20 ? I.sgGreater : I.sgLesser, 1]);
  let rare = false;
  for (const c of CHASE) {
    if (lvl >= c.min && Math.random() < c.chance * (boss ? 3 : 1)) {
      const [id, a, b] = pick(c.items);
      out.push([id, rint(a, b)]);
      rare = true;
    }
  }
  return { out, rare };
};

const addToInventory = (ref, items) => {
  const inv = mp.get(ref, 'inventory') || { entries: [] };
  const entries = (inv.entries || []).slice();
  for (const [baseId, count] of items) {
    const e = entries.find((x) => x.baseId === baseId && !x.worn && !x.name);
    if (e) e.count += count; else entries.push({ baseId, count });
  }
  mp.set(ref, 'inventory', { entries });
};

const dropLoot = (victim, killer) => {
  if (isPlayer(victim)) return;
  const { key, ed } = familyOfRef(victim);
  if (!key) return;
  const lvl = npcLevel(victim, 1);
  const boss = /Boss/.test(ed);
  const { out, rare } = rollLoot(key, lvl, boss);
  if (out.length === 0) return;
  addToInventory(victim, out);
  if (rare && killer && isPlayer(killer)) notify(killer, '✨ Nadir bir ganimet düştü! Cesedi ara.');
  console.log(`[sotr-loot] ${ed} (sv ${lvl}${boss ? ', boss' : ''}): ${out.map(([id, n]) => `${id.toString(16)}×${n}`).join(' ')}${rare ? ' NADİR' : ''}`);
};

// İlerleme sisteminin ölüm işleyicisini koruyarak zincirle
{
  const prev = mp.onDeath;
  mp.onDeath = (victim, killer) => {
    if (prev) prev(victim, killer);
    try { dropLoot(victim, killer); } catch (e) { console.log('[sotr-loot] hata', e && e.message); }
  };
}

// ---------------------------------------------------------------------------
// Kademeli sandıklar: Treas* sandıklar açılınca, bekleme süresi dolduysa ganimetle dolar.
// Seviye: açan oyuncunun leveli; boss sandıkları daha yüksek kademeden atar.
// ---------------------------------------------------------------------------

const CHEST_FILE = process.cwd() + '/sotr-chests.json';
let chestFilled = {};
try { chestFilled = JSON.parse(fs.readFileSync(CHEST_FILE, 'utf8')); } catch (e) { /* ilk açılış */ }
let chestDirty = false;
every(60000, () => {
  if (!chestDirty) return;
  chestDirty = false;
  try { fs.writeFileSync(CHEST_FILE, JSON.stringify(chestFilled)); } catch (e) { console.log('[sotr-loot] sandık kaydı yazılamadı', e && e.message); }
});

const CHEST_SKIP_RE = /EMPTY|NoRespawn|HouseNoble|CWMission|Burnt|Corpse/;
const chestKind = (ed) => {
  if (!/^Treas/.test(ed) || CHEST_SKIP_RE.test(ed)) return null;
  if (/Boss/.test(ed)) return { kind: 'boss', rolls: 4, cooldownH: 6 };
  if (/Chest|StrongBox|JewelryBox/.test(ed)) return { kind: 'chest', rolls: 2, cooldownH: 2 };
  return { kind: 'small', rolls: 1, cooldownH: 1 };
};

const chestLoot = (lvl, spec) => {
  const out = [[I.gold, rint(5 + lvl, 15 + lvl * (spec.kind === 'boss' ? 8 : spec.kind === 'chest' ? 4 : 1))]];
  const tiers = TIER_TABLES.filter((t) => lvl >= t.min);
  for (let i = 0; i < spec.rolls; i++) {
    // Yüksek kademeler daha nadir: sondan başa, kendi şanslarıyla
    for (let j = tiers.length - 1; j >= 0; j--) {
      if (Math.random() < tiers[j].chance * 1.5 || j === 0) {
        const [id, a, b] = pick(tiers[j].items);
        out.push([id, rint(a, b)]);
        break;
      }
    }
  }
  let rare = false;
  for (const c of CHASE) {
    if (lvl >= c.min && Math.random() < c.chance * (spec.kind === 'boss' ? 4 : 1)) {
      const [id, a, b] = pick(c.items);
      out.push([id, rint(a, b)]);
      rare = true;
    }
  }
  return { out, rare };
};

const onChestActivate = (ref, caster) => {
  if (!isPlayer(caster)) return;
  const rec = recordOf(baseIdOf(ref));
  if (!rec || rec.type !== 'CONT') return;
  const spec = chestKind(rec.editorId || '');
  if (!spec) return;
  const key = ref.toString(16);
  const now = Date.now();
  if (chestFilled[key] && now - chestFilled[key] < spec.cooldownH * 3600000) return;
  chestFilled[key] = now;
  chestDirty = true;
  const prog = getProg(caster);
  const plvl = (prog && prog.lvl) || 1;
  const lvl = spec.kind === 'boss' ? Math.max(plvl + 8, 16) : plvl;
  const { out, rare } = chestLoot(lvl, spec);
  addToInventory(ref, out);
  if (rare) notify(caster, '✨ Sandıkta nadir bir şey parlıyor!');
  console.log(`[sotr-loot] sandık ${rec.editorId} ${key} (sv ${lvl}) ${actorName(caster)}: ${out.map(([id, n]) => `${id.toString(16)}×${n}`).join(' ')}${rare ? ' NADİR' : ''}`);
};

// Başka onActivate kullanan yok; sıcak yüklemede zincir büyümesin diye doğrudan atanır.
mp.onActivate = (ref, caster) => {
  try { onChestActivate(ref, caster); } catch (e) { console.log('[sotr-loot] sandık hatası', e && e.message); }
  return true;
};

// ---------------------------------------------------------------------------
// Kayıt: olay kaynakları ve özellikler
// ---------------------------------------------------------------------------

const clientCall = (fn, cfg) => `(${fn.toString()})(ctx, ${JSON.stringify(cfg)});`;
const showOnce = (storageKey, jsExpr) => `
  const v = ctx.value;
  if (!v || v.seq === ctx.state.${storageKey}) return;
  ctx.state.${storageKey} = v.seq;
  ${jsExpr}
`;

const register = (what, fn) => {
  try { fn(); } catch (e) { console.log(`[sotr] ${what} kaydı atlandı (zaten kayıtlı olabilir): ${e && e.message}`); }
};
const ownerOnly = (updateOwner) => ({ isVisibleByOwner: !!updateOwner, isVisibleByNeighbors: false, updateOwner, updateNeighbor: '' });

register('_onSotrAdmin', () => mp.makeEventSource('_onSotrAdmin', clientCall(sotrAdminClient, { panelSrc: sotrAdminPanel.toString() })));
register('_onSotrProg', () => mp.makeEventSource('_onSotrProg', clientCall(sotrProgClient, {
  skills: SKILLS,
  replaced: Object.keys(REPLACED_PERKS).map(Number),
  skillPanelSrc: sotrSkillPanel.toString(),
  pointsPerLevel: SKILL_POINTS_PER_LEVEL,
  skillMax: SKILL_MAX,
  kPanel: false,
  treePerks: TREE_PERKS,
})));
register('sotrAdminData', () => mp.makeProperty('sotrAdminData', ownerOnly(showOnce('sotrAdminSeq', "ctx.sp.browser.executeJavaScript('window.sotrAdminRecv && window.sotrAdminRecv(' + JSON.stringify(v) + ')');"))));
register('sotrNotice', () => mp.makeProperty('sotrNotice', ownerOnly(showOnce('sotrNoticeSeq', 'ctx.sp.Debug.notification(v.text);'))));
register('sotrProg', () => mp.makeProperty('sotrProg', ownerOnly("ctx.sp.storage['sotrProg'] = ctx.value;")));
register('_onSotrChat', () => mp.makeEventSource('_onSotrChat', clientCall(sotrChatClient, { panelSrc: sotrChatPanel.toString(), probeSrc: sotrPerfProbe.toString() })));
register('sotrChat', () => mp.makeProperty('sotrChat', ownerOnly(`
  const v = ctx.value;
  if (!v || v.seq === ctx.state.sotrChatSeq) return;
  ctx.state.sotrChatSeq = v.seq;
  ctx.sp.browser.executeJavaScript('(' + ${JSON.stringify(sotrChatPanel.toString())} + ')(); window.sotrChatRecv(' + JSON.stringify(v) + ')');
`)));
// İsim etiketi: SkyMP başlık yazısını görünen addan (displayName) çizer.
register('sotrTag', () => mp.makeProperty('sotrTag', {
  isVisibleByOwner: false,
  isVisibleByNeighbors: true,
  updateOwner: '',
  updateNeighbor: `
    const v = ctx.value;
    if (typeof v !== 'string' || !ctx.refr) return;
    if (ctx.refr.getDisplayName() !== v) ctx.refr.setDisplayName(v, true);
    // Sesli sohbet için konum ve görüş hattı (kimlik = etiketin ilk parçası)
    const now = Date.now();
    const peers = ctx.sp.storage['sotrVoicePeers'] || (ctx.sp.storage['sotrVoicePeers'] = {});
    const id = v.split(' ')[0];
    if (!ctx.state.losAt || now - ctx.state.losAt > 300) {
      ctx.state.losAt = now;
      try { ctx.state.los = ctx.sp.Game.getPlayer().hasLOS(ctx.refr); } catch (e) { ctx.state.los = true; }
    }
    peers[id] = { x: ctx.refr.getPositionX(), y: ctx.refr.getPositionY(), z: ctx.refr.getPositionZ() + 110, los: ctx.state.los !== false, t: now };
  `,
}));
register('_onSotrVoice', () => mp.makeEventSource('_onSotrVoice', clientCall(sotrVoiceClient, {})));
register('sotrVoice', () => mp.makeProperty('sotrVoice', ownerOnly(showOnce('sotrVoiceSeq', `
  ctx.sp.browser.setVisible(true);
  ctx.sp.browser.executeJavaScript('(' + ${JSON.stringify(sotrVoicePanel.toString())} + ')(' + JSON.stringify({ url: v.url, token: v.token }) + ')');
`))));
register('sotrEmote', () => mp.makeProperty('sotrEmote', ownerOnly(showOnce('sotrEmoteSeq', 'ctx.sp.Debug.sendAnimationEvent(ctx.sp.Game.getPlayer(), v.anim);'))));
register('sotrBonus',() => mp.makeProperty('sotrBonus', ownerOnly('')));

console.log(`[sotr] gamemode yüklendi: ${familySummary().length} yaratık ailesi, ${SKILLS.length} beceri`);

// Açılışta ESM ayrıştırmasını doğrula (seviye ve zırh tipi)
{
  const pick = (re) => catalog.find((c) => re.test(c.name));
  const samples = [pick(/^EncWolf$/), pick(/^EncDraugr01Melee1H/), pick(/^EncDraugr05/), pick(/^EncBandit03Boss/)].filter(Boolean);
  const lv = samples.map((c) => `${c.name}=${npcLevelOfBase(c.id, 1)}/${npcLevelOfBase(c.id, 20)}`).join(', ');
  const armor = [[0x12e49, 'IronCuirass'], [0x3619e, 'LeatherCuirass']].map(([id, n]) => `${n}=${armorTypeOf(id)}`).join(', ');
  const hp = [pick(/^EncSkeever$/), pick(/^EncWolf$/), pick(/^EncDraugr01Melee1H/), pick(/^EncBear$/)].filter(Boolean).map((c) => `${c.name}=${Math.round(healthOfChain([c.id]))}`).join(', ');
  console.log(`[sotr] öz-denetim: seviye (oyuncu 1/20) ${lv}; zırh tipi ${armor}; can ${hp}`);
}
