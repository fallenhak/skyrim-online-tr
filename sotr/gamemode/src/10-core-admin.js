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
