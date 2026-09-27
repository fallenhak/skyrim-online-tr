
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
