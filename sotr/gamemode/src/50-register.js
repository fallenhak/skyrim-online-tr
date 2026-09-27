
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
register('_onSotrChat', () => mp.makeEventSource('_onSotrChat', clientCall(sotrChatClient, { panelSrc: sotrChatPanel.toString() })));
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
register('sotrBonus',() => mp.makeProperty('sotrBonus', ownerOnly('')));

console.log(`[sotr] gamemode yüklendi: ${familySummary().length} yaratık ailesi, ${SKILLS.length} beceri`);
