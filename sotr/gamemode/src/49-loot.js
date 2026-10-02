
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
  if (rare && killer && isPlayer(killer)) notify(killer, 'Something rare dropped. Search the body.');
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
  if (rare) notify(caster, 'Something rare glints inside the chest.');
  console.log(`[sotr-loot] sandık ${rec.editorId} ${key} (sv ${lvl}) ${actorName(caster)}: ${out.map(([id, n]) => `${id.toString(16)}×${n}`).join(' ')}${rare ? ' NADİR' : ''}`);
};

// Başka onActivate kullanan yok; sıcak yüklemede zincir büyümesin diye doğrudan atanır.
mp.onActivate = (ref, caster) => {
  try { onChestActivate(ref, caster); } catch (e) { console.log('[sotr-loot] sandık hatası', e && e.message); }
  return true;
};
