import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Chess } from './vendor/chess.js';

// ---------------------------------------------------------------- champions
// yaw: per-model rotation fix (radians) once we see how each GLB comes out facing.
const CHAMPS = {
  garen:    { name: 'Garen', title: 'The Might of Demacia', yaw: 0,
              lines: ['DEMACIA!', 'Spin to win, your majesty.', 'Justice is in session.'] },
  darius:   { name: 'Darius', title: 'The Hand of Noxus', yaw: 0,
              lines: ['Noxus will rise!', 'Get dunked.', 'Weakness disgusts me. So does this crown.'] },
  kayle:    { name: 'Kayle', title: 'The Righteous', yaw: 0,
              lines: ['Level 16. Now I am a problem.', 'Judgment is coming.', 'Behold, the queen of the late game.'] },
  shaco:    { name: 'Shaco', title: 'The Demon Jester', yaw: 0,
              lines: ['Look behind you.', 'Why so serious?', 'Now you see me...'] },
  teemo:    { name: 'Teemo', title: 'The Swift Scout', yaw: 0,
              lines: ['Captain Teemo on duty!', 'Hut, two, three, four.', 'Size does not mean everything.'] },
  malphite: { name: 'Malphite', title: 'Shard of the Monolith', yaw: 0,
              lines: ['Rock solid.', 'I only go in straight lines. Like my ult.', 'Unstoppable force, meet immovable rook.'] },
  yasuo:    { name: 'Yasuo', title: 'The Unforgiven', yaw: 0,
              lines: ['Hasagi!', '0/10 is a power spike.', 'Death is like the wind, always by my side.'] },
  taric:    { name: 'Taric', title: 'The Shield of Valoran', yaw: 0,
              lines: ['Truly, truly outrageous.', 'Did someone say... gems?', 'Behold, the pinnacle of fabulous.'] },
};
const ROSTER = {
  w: { k: 'garen', q: 'kayle', r: 'malphite', b: 'taric', n: 'yasuo', p: 'teemo' },
  b: { k: 'darius', q: 'kayle', r: 'malphite', b: 'shaco', n: 'yasuo', p: 'teemo' },
};
const ROLE = { k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn' };
const HEIGHT = { p: 0.72, r: 0.86, n: 0.94, b: 0.98, q: 1.08, k: 1.18 };
const TEAM = {
  w: { name: 'Demacia', base: 0xece4d0, trim: 0xc8aa6e, glow: 0x0ac8b9, figure: 0xf0e8d8 },
  b: { name: 'Noxus', base: 0x17171c, trim: 0xa4202e, glow: 0xe84057, figure: 0x2a2a33 },
};
const NOXUS_TINT = new THREE.Color(0.78, 0.62, 0.64); // darkens shared champions on the Noxus side
const MODEL_YAW = -Math.PI / 2; // Tripo GLBs face -X; this turns them to face +Z (the white player's camera)
const STREAK = { 2: 'Double kill', 3: 'Triple kill', 4: 'Quadra kill', 5: 'PENTAKILL' };
const BUST = Date.now();
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- state
const chess = new Chess();
const assets = {};          // key -> { image, model, noxus }
const pieces = new Map();   // square -> THREE.Group
const feed = [];
let selected = null, legal = [];
let vsAI = false, sound = true, viewer = 'w', busy = false, firstBlood = true;

// ---------------------------------------------------------------- scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e17);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * 0.46;

scene.add(new THREE.HemisphereLight(0xfff4e0, 0x202838, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(5, 12, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
sun.shadow.bias = -0.0004;
scene.add(sun);
for (const [color, x, z] of [[TEAM.w.glow, -7, 7], [TEAM.b.glow, 7, -7]]) {
  const rim = new THREE.PointLight(color, 60, 0, 2);
  rim.position.set(x, 3, z);
  scene.add(rim);
}

// ---------------------------------------------------------------- board (Summoner's Rift)
// A slab whose top face carries the Rift map (assets/board/rift.png), with a translucent
// checker overlay on top so squares stay readable. The map's top edge sits on Noxus' side.
const squarePos = (sq) => new THREE.Vector3(sq.charCodeAt(0) - 97 - 3.5, 0, 3.5 - (+sq[1] - 1));
const tiles = [];
const riftMat = new THREE.MeshStandardMaterial({ color: 0x2c4a3a, roughness: 0.85 });
const groundMat = new THREE.MeshStandardMaterial({ color: 0x14241a, roughness: 1 });
scene.fog = new THREE.Fog(0x0a0e17, 12, 30);
{
  const side = new THREE.MeshStandardMaterial({ color: 0x2b2f2a, roughness: 0.8 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 8), [side, side, riftMat, side, side, side]);
  slab.position.y = -0.1;
  slab.receiveShadow = true;
  scene.add(slab);

  const geo = new THREE.PlaneGeometry(1, 1);
  const light = new THREE.MeshBasicMaterial({ color: 0xfff4dc, transparent: true, opacity: 0.1, depthWrite: false });
  const dark = new THREE.MeshBasicMaterial({ color: 0x06101f, transparent: true, opacity: 0.4, depthWrite: false });
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = String.fromCharCode(97 + f) + (r + 1);
    const t = new THREE.Mesh(geo, (r + f) % 2 ? light : dark);
    t.rotation.x = -Math.PI / 2;
    t.position.copy(squarePos(sq)).setY(0.002);
    t.userData.square = sq;
    tiles.push(t);
    scene.add(t);
  }
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.32;
  ground.receiveShadow = true;
  scene.add(ground);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.3, 9.4),
    new THREE.MeshStandardMaterial({ color: 0x23261f, metalness: 0.3, roughness: 0.7 }));
  frame.position.y = -0.16;
  frame.receiveShadow = true;
  const inlay = new THREE.Mesh(new THREE.BoxGeometry(8.3, 0.2, 8.3),
    new THREE.MeshStandardMaterial({ color: 0xc8aa6e, metalness: 1, roughness: 0.3 }));
  inlay.position.y = -0.12; // top at -0.02, just under the tile tops at y=0
  scene.add(frame, inlay);
}

// ---------------------------------------------------------------- square markers
const marks = new THREE.Group(), lastMarks = new THREE.Group();
scene.add(marks, lastMarks);
const MARK = {
  dot: new THREE.CircleGeometry(0.14, 24),
  ring: new THREE.RingGeometry(0.36, 0.46, 32),
  square: new THREE.PlaneGeometry(0.98, 0.98),
};
function mark(group, sq, geo, color, opacity, y = 0.004) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.copy(squarePos(sq)).setY(y);
  group.add(m);
}
function clearGroup(g) {
  for (const m of [...g.children]) { m.material.dispose(); g.remove(m); }
}
function drawSelection() {
  clearGroup(marks);
  if (!selected) return;
  mark(marks, selected, MARK.ring, 0xf0e6d2, 0.95, 0.006);
  for (const m of legal) {
    if (m.captured) mark(marks, m.to, MARK.ring, TEAM.b.glow, 0.9, 0.006);
    else mark(marks, m.to, MARK.dot, TEAM.w.glow, 0.85, 0.006);
  }
}
function drawLastMove() {
  clearGroup(lastMarks);
  const last = chess.history({ verbose: true }).at(-1);
  if (last) for (const sq of [last.from, last.to]) mark(lastMarks, sq, MARK.square, 0xc8aa6e, 0.28);
  if (chess.isCheck()) {
    const king = chess.board().flat().find((c) => c && c.type === 'k' && c.color === chess.turn());
    mark(lastMarks, king.square, MARK.square, 0xe84057, 0.55);
  }
}

// ---------------------------------------------------------------- pieces
const baseGeo = new THREE.CylinderGeometry(0.4, 0.44, 0.1, 40);
const trimGeo = new THREE.TorusGeometry(0.42, 0.025, 12, 48);
const baseMat = {}, trimMat = {}, figMat = {};
for (const c of ['w', 'b']) {
  baseMat[c] = new THREE.MeshStandardMaterial({ color: TEAM[c].base, roughness: 0.3, metalness: c === 'w' ? 0.1 : 0.4 });
  trimMat[c] = new THREE.MeshStandardMaterial({ color: TEAM[c].trim, metalness: 0.9, roughness: 0.25,
    emissive: TEAM[c].glow, emissiveIntensity: 0.4 });
  figMat[c] = new THREE.MeshStandardMaterial({ color: TEAM[c].figure, roughness: 0.35, metalness: 0.15 });
}

// Placeholder classic piece, used until a champion's 3D model exists.
const PROFILE = [[0, 0], [0.95, 0], [0.95, 0.08], [0.7, 0.14], [0.5, 0.2], [0.33, 0.55],
  [0.62, 0.6], [0.62, 0.64], [0.3, 0.68], [0, 0.68]];
function placeholder(type, color) {
  const h = HEIGHT[type], mat = figMat[color], g = new THREE.Group();
  const add = (geo, y, sx = 1, sy = 1, sz = 1, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y; m.scale.set(sx, sy, sz); m.rotation.x = rx;
    m.castShadow = true; g.add(m);
  };
  add(new THREE.LatheGeometry(PROFILE.map(([x, y]) => new THREE.Vector2(x * 0.3, y * h)), 32), 0);
  const top = 0.68 * h;
  if (type === 'p') add(new THREE.SphereGeometry(0.14, 24, 16), top + 0.1);
  if (type === 'r') add(new THREE.CylinderGeometry(0.2, 0.18, 0.3 * h, 8), top + 0.15 * h);
  if (type === 'n') add(new THREE.BoxGeometry(0.16, 0.34, 0.3), top + 0.14, 1, 1, 1, -0.4);
  if (type === 'b') add(new THREE.SphereGeometry(0.16, 24, 16), top + 0.16, 1, 1.6, 1);
  if (type === 'q') { add(new THREE.SphereGeometry(0.17, 24, 16), top + 0.16); add(new THREE.TorusGeometry(0.15, 0.03, 8, 24), top + 0.3, 1, 1, 1, Math.PI / 2); }
  if (type === 'k') { add(new THREE.CylinderGeometry(0.17, 0.2, 0.2, 24), top + 0.1); add(new THREE.BoxGeometry(0.07, 0.22, 0.07), top + 0.3); add(new THREE.BoxGeometry(0.2, 0.07, 0.07), top + 0.32); }
  return g;
}

function normalize(root) {
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  root.position.set(-center.x, -box.min.y, -center.z);
  const unit = new THREE.Group();
  unit.add(root);
  unit.scale.setScalar(1 / size.y);
  unit.rotation.y = MODEL_YAW;
  const wrap = new THREE.Group();
  wrap.add(unit);
  wrap.userData.aspect = Math.max(size.x, size.z) / size.y;
  return wrap;
}

function modelFor(key, color) {
  const a = assets[key];
  const shared = Object.values(ROSTER.w).includes(key) && Object.values(ROSTER.b).includes(key);
  if (color === 'w' || !shared) return a.model;
  if (!a.noxus) {
    a.noxus = a.model.clone();
    a.noxus.traverse((o) => {
      if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(NOXUS_TINT); }
    });
  }
  return a.noxus;
}

function makePiece(type, color) {
  const key = ROSTER[color][type], g = new THREE.Group();
  const base = new THREE.Mesh(baseGeo, baseMat[color]);
  base.position.y = 0.05;
  base.castShadow = base.receiveShadow = true;
  const trim = new THREE.Mesh(trimGeo, trimMat[color]);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.1;
  const fig = new THREE.Group();
  fig.position.y = 0.1;
  if (assets[key].model) {
    const tpl = modelFor(key, color), m = tpl.clone();
    m.scale.setScalar(Math.min(HEIGHT[type], 0.9 / tpl.userData.aspect));
    fig.add(m);
  } else {
    fig.add(placeholder(type, color));
  }
  g.add(base, trim, fig);
  g.userData = { type, color, key, fig, kills: 0 };
  return g;
}

function faceViewer(g) {
  g.userData.fig.rotation.y = (viewer === 'w' ? 0 : Math.PI) + CHAMPS[g.userData.key].yaw;
}
function place(g, sq) {
  g.position.copy(squarePos(sq));
  g.userData.square = sq;
  pieces.set(sq, g);
  faceViewer(g);
  scene.add(g);
}
function rebuildPieces() {
  for (const g of pieces.values()) scene.remove(g);
  pieces.clear();
  for (const c of chess.board().flat()) if (c) place(makePiece(c.type, c.color), c.square);
}

// ---------------------------------------------------------------- tweens + effects
const tweens = new Set();
const tween = (dur, fn) => new Promise((res) => tweens.add({ t0: performance.now(), dur, fn, res }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

async function slide(g, sq, hop) {
  const a = g.position.clone(), b = squarePos(sq);
  const h = hop ?? 0.35 + a.distanceTo(b) * 0.06;
  await tween(340, (k) => {
    g.position.lerpVectors(a, b, ease(k));
    g.position.y = Math.sin(Math.PI * k) * h;
  });
  g.userData.square = sq;
}
async function yeet(g) {
  const a = g.position.clone(), spin = Math.random() < 0.5 ? -1 : 1;
  const dir = new THREE.Vector3((Math.random() - 0.5) * 2, 0, g.userData.color === 'w' ? 2.5 : -2.5);
  await tween(700, (k) => {
    g.position.set(a.x + dir.x * k * 2, Math.sin(k * Math.PI) * 2.4, a.z + dir.z * k * 2);
    g.rotation.set(spin * k * 7, 0, spin * k * 3);
    g.scale.setScalar(1 - k * 0.7);
  });
  scene.remove(g);
}
function burst(pos, color) {
  const n = 48, p = new Float32Array(n * 3), v = [];
  for (let i = 0; i < n; i++) v.push(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3 + 1, (Math.random() - 0.5) * 3));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.PointsMaterial({ color, size: 0.09, transparent: true, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  tween(750, (k) => {
    for (let i = 0; i < n; i++) {
      p[i * 3] = pos.x + v[i].x * k;
      p[i * 3 + 1] = 0.4 + v[i].y * k - 3.5 * k * k;
      p[i * 3 + 2] = pos.z + v[i].z * k;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = 1 - k;
  }).then(() => { scene.remove(pts); geo.dispose(); mat.dispose(); });
}

// ---------------------------------------------------------------- sound
let actx;
function sfx(kind) {
  if (!sound) return;
  actx ??= new AudioContext();
  const now = actx.currentTime;
  const tone = (type, f0, f1, t, dur, vol) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, now + t);
    o.frequency.exponentialRampToValueAtTime(f1, now + t + dur);
    g.gain.setValueAtTime(vol, now + t);
    g.gain.exponentialRampToValueAtTime(0.001, now + t + dur);
    o.connect(g).connect(actx.destination);
    o.start(now + t);
    o.stop(now + t + dur + 0.02);
  };
  if (kind === 'select') tone('sine', 900, 1200, 0, 0.06, 0.08);
  if (kind === 'move') tone('sine', 180, 70, 0, 0.14, 0.35);
  if (kind === 'capture') { tone('sawtooth', 560, 160, 0, 0.25, 0.18); tone('triangle', 420, 120, 0.02, 0.25, 0.3); }
  if (kind === 'check') { tone('square', 880, 870, 0, 0.1, 0.08); tone('square', 660, 650, 0.12, 0.16, 0.08); }
  if (kind === 'win') [440, 554, 659, 880].forEach((f, i) => tone('triangle', f, f, i * 0.13, 0.45, 0.22));
}

// ---------------------------------------------------------------- HUD
let quoteTimer, bannerTimer;
function say(key, text) {
  const c = CHAMPS[key];
  $('quote-img').src = assets[key]?.image ?? '';
  $('quote-name').textContent = `${c.name} - ${c.title}`;
  $('quote-text').textContent = `"${text ?? c.lines[Math.floor(Math.random() * c.lines.length)]}"`;
  const q = $('quote');
  q.hidden = false;
  q.style.animation = 'none'; void q.offsetWidth; q.style.animation = '';
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(() => { q.hidden = true; }, 3800);
}
function banner(text, red = false, sticky = false) {
  const b = $('banner');
  b.textContent = text;
  b.className = `banner${red ? ' red' : ''}`;
  b.hidden = false;
  clearTimeout(bannerTimer);
  if (!sticky) bannerTimer = setTimeout(() => { b.hidden = true; }, 1700);
}
function updateHUD() {
  const t = chess.turn(), turn = $('turn');
  turn.className = `turn${t === 'b' ? ' black' : ''}${chess.isCheck() ? ' check' : ''}`;
  $('turn-text').textContent = chess.isGameOver() ? 'Game over'
    : busy && vsAI && t === 'b' ? 'Noxus is thinking...'
    : `${TEAM[t].name} to move${chess.isCheck() ? ' - check!' : ''}`;

  const hist = chess.history(), moves = $('moves');
  moves.innerHTML = '';
  for (let i = 0; i < hist.length; i += 2) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="n">${i / 2 + 1}.</span><span></span><span></span>`;
    li.children[1].textContent = hist[i];
    li.children[2].textContent = hist[i + 1] ?? '';
    moves.append(li);
  }
  moves.parentElement.scrollTop = moves.parentElement.scrollHeight;

  const fl = $('feed');
  fl.innerHTML = '';
  for (const f of feed.slice(-8).reverse()) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="${f.color}"></span> slew <span class="${f.color === 'w' ? 'b' : 'w'}"></span>${f.tag ? ` <em></em>` : ''}`;
    li.children[0].textContent = CHAMPS[f.killer].name;
    li.children[1].textContent = CHAMPS[f.victim].name;
    if (f.tag) li.children[2].textContent = `(${f.tag})`;
    fl.append(li);
  }
  $('btn-undo').disabled = busy || hist.length === 0;
}
function renderRoster() {
  const ul = $('roster');
  ul.innerHTML = '';
  for (const [key, c] of Object.entries(CHAMPS)) {
    const roles = ['w', 'b'].flatMap((col) => Object.entries(ROSTER[col])
      .filter(([, k]) => k === key).map(([t]) => `${ROLE[t]} (${TEAM[col].name})`));
    const shared = roles.length === 2 && roles[0].split(' ')[0] === roles[1].split(' ')[0];
    const a = assets[key];
    const status = a.model ? ['s-model', '3D model'] : a.image ? ['s-image', 'Art approved, 3D pending'] : ['s-none', 'Awaiting art'];
    const li = document.createElement('li');
    li.innerHTML = `${a.image ? '<img alt="">' : '<div class="ph">?</div>'}
      <div><div class="r-name"></div><div class="r-role"></div><div class="r-status ${status[0]}"></div></div>`;
    if (a.image) li.querySelector('img').src = a.image;
    li.querySelector('.r-name').textContent = c.name;
    li.querySelector('.r-role').textContent = shared ? `${roles[0].split(' ')[0]} (both sides)` : roles.join(', ');
    li.querySelector('.r-status').textContent = status[1];
    li.addEventListener('click', () => say(key));
    ul.append(li);
  }
}

// ---------------------------------------------------------------- game flow
function deselect() {
  selected = null;
  legal = [];
  drawSelection();
}
function select(sq) {
  selected = sq;
  legal = chess.moves({ square: sq, verbose: true });
  drawSelection();
  sfx('select');
  say(pieces.get(sq).userData.key);
}

async function play(m) {
  busy = true;
  deselect();
  const res = chess.move({ from: m.from, to: m.to, promotion: m.promotion });
  const mover = pieces.get(res.from);
  pieces.delete(res.from);
  const jobs = [slide(mover, res.to)];

  if (res.captured) {
    const capSq = res.flags.includes('e') ? res.to[0] + res.from[1] : res.to;
    const victim = pieces.get(capSq);
    pieces.delete(capSq);
    mover.userData.kills++;
    const tag = firstBlood ? 'First blood' : STREAK[Math.min(mover.userData.kills, 5)];
    feed.push({ color: res.color, killer: mover.userData.key, victim: victim.userData.key, tag });
    jobs.push(wait(220).then(() => { burst(victim.position, TEAM[res.color].glow); return yeet(victim); }));
    if (tag) banner(tag, res.color === 'b');
    firstBlood = false;
    say(mover.userData.key, `${CHAMPS[mover.userData.key].lines[0]} ${CHAMPS[victim.userData.key].name} has been slain!`);
    sfx('capture');
  } else {
    sfx('move');
  }
  if (res.flags.includes('k') || res.flags.includes('q')) {
    const r = res.to[1], [from, to] = res.flags.includes('k') ? ['h' + r, 'f' + r] : ['a' + r, 'd' + r];
    const rook = pieces.get(from);
    pieces.delete(from);
    pieces.set(to, rook);
    jobs.push(slide(rook, to, 0.7));
  }
  pieces.set(res.to, mover);
  updateHUD();
  await Promise.all(jobs);

  if (res.promotion) {
    scene.remove(mover);
    const promoted = makePiece(res.promotion, res.color);
    promoted.userData.kills = mover.userData.kills;
    place(promoted, res.to);
    say(promoted.userData.key, `A Teemo became me. ${CHAMPS[promoted.userData.key].lines[0]}`);
  }
  busy = false;
  afterMove();
}

function afterMove() {
  drawLastMove();
  updateHUD();
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'b' : 'w';
    banner(vsAI ? (winner === 'w' ? 'Victory' : 'Defeat') : `${TEAM[winner].name} wins`, winner === 'b', true);
    say(ROSTER[winner].k);
    sfx('win');
  } else if (chess.isDraw()) {
    banner(chess.isStalemate() ? 'Stalemate' : 'Draw', false, true);
  } else if (chess.isCheck()) {
    sfx('check');
  }
  if (vsAI && chess.turn() === 'b' && !chess.isGameOver()) {
    busy = true;
    updateHUD();
    setTimeout(() => { busy = false; play(bestMove()); }, 350);
  }
}

function askPromotion(options) {
  const box = $('promo-options');
  box.innerHTML = '';
  for (const m of options) {
    const key = ROSTER[m.color][m.promotion], btn = document.createElement('button');
    btn.innerHTML = `${assets[key].image ? '<img alt="">' : ''}<span></span>`;
    if (assets[key].image) btn.querySelector('img').src = assets[key].image;
    btn.querySelector('span').textContent = `${CHAMPS[key].name} (${ROLE[m.promotion]})`;
    btn.addEventListener('click', () => { $('promo').hidden = true; play(m); });
    box.append(btn);
  }
  $('promo').hidden = false;
}

// ---------------------------------------------------------------- AI (3-ply alpha-beta, material + center)
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
function evaluate() {
  let s = 0;
  for (const c of chess.board().flat()) {
    if (!c) continue;
    const f = c.square.charCodeAt(0) - 97, r = +c.square[1] - 1;
    let v = VAL[c.type];
    if (c.type !== 'k') v += ((3.5 - Math.abs(f - 3.5)) + (3.5 - Math.abs(r - 3.5))) * 4;
    if (c.type === 'p') v += (c.color === 'w' ? r : 7 - r) * 6;
    s += c.color === 'w' ? v : -v;
  }
  return s;
}
const order = (ms) => ms.sort((a, b) => (b.captured ? VAL[b.captured] : 0) - (a.captured ? VAL[a.captured] : 0));
function search(depth, alpha, beta) {
  if (depth === 0) return (chess.turn() === 'w' ? 1 : -1) * evaluate();
  const ms = chess.moves({ verbose: true });
  if (!ms.length) return chess.isCheck() ? -100000 - depth : 0;
  for (const m of order(ms)) {
    chess.move(m);
    const v = -search(depth - 1, -beta, -alpha);
    chess.undo();
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}
function bestMove() {
  const ms = order(chess.moves({ verbose: true }).sort(() => Math.random() - 0.5));
  let best = ms[0], bestV = -Infinity;
  for (const m of ms) {
    chess.move(m);
    const v = -search(2, -Infinity, -bestV);
    chess.undo();
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
}

// ---------------------------------------------------------------- input
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const dragged = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6;
  downAt = null;
  if (!dragged) onClick(e);
});
function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  // Raycast the visible meshes so a tall piece in front can't steal clicks meant for the one behind it.
  const hit = ray.intersectObjects([...pieces.values(), ...tiles], true)[0];
  if (!hit) return null;
  let o = hit.object;
  while (!o.userData.square && o.parent) o = o.parent;
  return o.userData.square ?? null;
}
function onClick(e) {
  if (busy || chess.isGameOver() || (vsAI && chess.turn() === 'b')) return;
  const sq = pick(e);
  if (!sq) return deselect();
  if (selected) {
    const opts = legal.filter((m) => m.to === sq);
    if (opts.length > 1) return askPromotion(opts);
    if (opts.length === 1) return play(opts[0]);
  }
  const p = chess.get(sq);
  if (p && p.color === chess.turn() && sq !== selected) select(sq);
  else deselect();
}

function setView(side) {
  viewer = side;
  camera.position.set(0, 9, side === 'w' ? 9.5 : -9.5);
  controls.target.set(0, 0, 0);
  controls.update();
  for (const g of pieces.values()) faceViewer(g);
}
function newGame() {
  chess.reset();
  feed.length = 0;
  firstBlood = true;
  busy = false;
  $('banner').hidden = true;
  deselect();
  rebuildPieces();
  drawLastMove();
  updateHUD();
}

$('btn-new').addEventListener('click', newGame);
$('btn-undo').addEventListener('click', () => {
  if (busy) return;
  chess.undo();
  if (vsAI && chess.turn() === 'b') chess.undo();
  $('banner').hidden = true;
  deselect();
  rebuildPieces();
  drawLastMove();
  updateHUD();
});
$('btn-flip').addEventListener('click', () => setView(viewer === 'w' ? 'b' : 'w'));
$('btn-ai').addEventListener('click', (e) => {
  vsAI = !vsAI;
  e.currentTarget.setAttribute('aria-pressed', vsAI);
  e.currentTarget.textContent = `Vs AI: ${vsAI ? 'on' : 'off'}`;
  if (vsAI && chess.turn() === 'b' && !busy && !chess.isGameOver()) afterMove();
});
$('btn-sound').addEventListener('click', (e) => {
  sound = !sound;
  e.currentTarget.setAttribute('aria-pressed', sound);
  e.currentTarget.textContent = `Sound: ${sound ? 'on' : 'off'}`;
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- loop + boot
renderer.setAnimationLoop((now) => {
  for (const t of tweens) {
    const k = Math.min(1, (now - t.t0) / t.dur);
    t.fn(k);
    if (k >= 1) { tweens.delete(t); t.res(); }
  }
  for (const g of pieces.values()) {
    g.userData.fig.position.y = g.userData.square === selected ? 0.2 + Math.sin(now / 180) * 0.04 : 0.1;
  }
  controls.update();
  renderer.render(scene, camera);
});

async function exists(url) {
  try { return (await fetch(url, { method: 'HEAD', cache: 'no-store' })).ok; } catch { return false; }
}
async function loadTexture(url) {
  const t = await new THREE.TextureLoader().loadAsync(`${url}?v=${BUST}`);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
async function loadBoard() {
  const [rift, jungle] = await Promise.all(['assets/board/rift.png', 'assets/board/jungle.png']
    .map(async (u) => ((await exists(u)) ? loadTexture(u) : null)));
  if (rift) Object.assign(riftMat, { map: rift, needsUpdate: true }).color.set(0xffffff);
  if (jungle) {
    jungle.wrapS = jungle.wrapT = THREE.RepeatWrapping;
    jungle.repeat.set(14, 14);
    Object.assign(groundMat, { map: jungle, needsUpdate: true }).color.set(0x4a584a); // dimmed so the board pops
  }
}
async function loadAssets() {
  const gltf = new GLTFLoader();
  await Promise.all(Object.keys(CHAMPS).map(async (key) => {
    const img = `assets/images/${key}.png`, glb = `assets/models/${key}.glb`;
    const [hasImg, hasGlb] = await Promise.all([exists(img), exists(glb)]);
    assets[key] = { image: hasImg ? `${img}?v=${BUST}` : null, model: null };
    if (hasGlb) {
      try { assets[key].model = normalize((await gltf.loadAsync(`${glb}?v=${BUST}`)).scene); }
      catch (err) { console.warn(`[${key}] model failed to load`, err); }
    }
  }));
}

await Promise.all([loadAssets(), loadBoard()]);
renderRoster();
setView('w');
newGame();
$('loading').hidden = true;
