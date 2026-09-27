
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
    room.connect(cfg.url, cfg.token, { autoSubscribe: true }).then(function () {
      return room.localParticipant.setMicrophoneEnabled(true);
    }).then(function () {
      V.mic = room.localParticipant.getTrackPublication(LK.Track.Source.Microphone);
      if (V.mic && V.mic.track) V.mic.track.mute();
      room.localParticipant.setAttributes({ mode: V.mode });
      V.ready = true;
      drawHud();
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
    if (!V.ready || V.talking === on) return;
    V.talking = on;
    if (ctx.state === 'suspended') ctx.resume();
    if (V.mic && V.mic.track) { if (on) V.mic.track.unmute(); else V.mic.track.mute(); }
    drawHud();
  };
  window.sotrVoiceMode = function () {
    V.mode = V.mode === 'normal' ? 'shout' : V.mode === 'shout' ? 'whisper' : 'normal';
    if (V.room && V.ready) V.room.localParticipant.setAttributes({ mode: V.mode });
    drawHud();
  };
  // Oyundan her ~100 ms: dinleyici konumu/yönü, ortam, komşuların konumu ve görüş hattı
  window.sotrVoiceTick = function (t) {
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
