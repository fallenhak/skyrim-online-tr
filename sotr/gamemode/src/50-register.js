
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
})));
register('sotrAdminData', () => mp.makeProperty('sotrAdminData', ownerOnly(showOnce('sotrAdminSeq', "ctx.sp.browser.executeJavaScript('window.sotrAdminRecv && window.sotrAdminRecv(' + JSON.stringify(v) + ')');"))));
register('sotrNotice', () => mp.makeProperty('sotrNotice', ownerOnly(showOnce('sotrNoticeSeq', 'ctx.sp.Debug.notification(v.text);'))));
register('sotrProg', () => mp.makeProperty('sotrProg', ownerOnly("ctx.sp.storage['sotrProg'] = ctx.value;")));
register('sotrBonus', () => mp.makeProperty('sotrBonus', ownerOnly('')));

console.log(`[sotr] gamemode yüklendi: ${familySummary().length} yaratık ailesi, ${SKILLS.length} beceri`);
