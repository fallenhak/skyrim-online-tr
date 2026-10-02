
// Açılışta ESM ayrıştırmasını doğrula (seviye ve zırh tipi)
{
  const pick = (re) => catalog.find((c) => re.test(c.name));
  const samples = [pick(/^EncWolf$/), pick(/^EncDraugr01Melee1H/), pick(/^EncDraugr05/), pick(/^EncBandit03Boss/)].filter(Boolean);
  const lv = samples.map((c) => `${c.name}=${npcLevelOfBase(c.id, 1)}/${npcLevelOfBase(c.id, 20)}`).join(', ');
  const armor = [[0x12e49, 'IronCuirass'], [0x3619e, 'LeatherCuirass']].map(([id, n]) => `${n}=${armorTypeOf(id)}`).join(', ');
  const hp = [pick(/^EncSkeever$/), pick(/^EncWolf$/), pick(/^EncDraugr01Melee1H/), pick(/^EncBear$/)].filter(Boolean).map((c) => `${c.name}=${Math.round(healthOfChain([c.id]))}`).join(', ');
  console.log(`[sotr] öz-denetim: seviye (oyuncu 1/20) ${lv}; zırh tipi ${armor}; can ${hp}`);
}
