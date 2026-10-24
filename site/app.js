// Huddle landing: scroll choreography, the doodled people walking around the hills,
// and the little interactions.
import { figure, filterDefs, LOCK, world } from "./doodles.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
document.body.insertAdjacentHTML("afterbegin", filterDefs);
// The background is three planes (sky, far hills, near hills) that slide at different speeds.
// Each plane is drawn twice with a different wobble and the page flips between the two copies;
// they are cached as images, so neither the flicker nor the scrolling redraws any SVG.
// Phones and reduced motion get a single still copy.
const still = reduce || innerWidth < 760;
const PLANES = [["back", ["sky", "sun", "clouds"]], ["mid", ["far", "mid"]], ["front", ["near"]]];
$("#world").innerHTML = PLANES.map(([name, only]) => `<div class="plane plane-${name}"><div class="frame">${world({ only })}</div>${still ? "" : `<div class="frame frame-b">${world({ only, wobble: "wobB" })}</div>`}</div>`).join("");
const planes = $$("#world .plane");
$$(".card-world").forEach((el, i) => { el.innerHTML = world({ sun: i !== 2 }); });

// ---- The cast ---------------------------------------------------------------
const FRIENDS = [
  { name: "Alex", hair: "curly", face: "smile", scarf: "#8fe03b", wander: ["idk", "anything!", "hmm…"], argue: ["Safe!", "Quiet pls"] },
  { name: "Sam", hair: "mop", face: "grin", scarf: "#ff5fb4", wander: ["not sushi", "somewhere new?"], argue: ["New place!", "No sushi!"] },
  { name: "Jordan", hair: "cap", face: "beard", scarf: "#1f3fd8", wander: ["$$$?", "cheap pls"], argue: ["Budget!", "$12 tacos"] },
  { name: "Riley", hair: "pony", face: "grin", scarf: "#ffd23a", wander: ["dessert??", "where tho"], argue: ["Dessert!", "CREAM!"] },
];
const EXTRAS = [
  { hair: "spiky", face: "smile", scarf: "#ffffff" },
  { hair: "bald", face: "grin", scarf: "#ff5fb4" },
  { hair: "mop", face: "smile", scarf: "#1f3fd8" },
  { hair: "cap", face: "smile", scarf: "#8fe03b" },
];

$("#navFig").innerHTML = figure({ hair: "curly", face: "grin", scarf: "#ff5fb4" });
$("#cardCast").innerHTML = FRIENDS.map((f) => `<div class="dancer">${figure(f)}</div>`).join("");

// ---- Scroll: everything that depends on scroll position, measured once per frame --
// Hero progress drives the card and headline; the call section's progress plays the call;
// the section in the middle of the screen decides what the walkers act out.
const hero = $("#hero"), callWrap = $("#call"), callCard = $("#callCard");
const ACTS = [["#private", "private"], ["#argue", "argue"], ["#call", "call"], ["#start", "huddle"]].map(([s, n]) => [$(s), n]);
let act = "wander", queued = false;
function onScroll() {
  queued = false;
  const r = hero.getBoundingClientRect();
  const p = clamp(-r.top / (hero.offsetHeight - innerHeight));
  hero.style.setProperty("--p", clamp(p / 0.5).toFixed(4));
  hero.style.setProperty("--h", clamp((p - 0.2) / 0.4).toFixed(4));

  const sp = clamp(scrollY / (document.documentElement.scrollHeight - innerHeight));
  [260, 30, 70].forEach((d, i) => { planes[i].style.transform = `translate3d(0, ${(-sp * d).toFixed(1)}px, 0)`; });

  const c = callWrap.getBoundingClientRect();
  const q = clamp(-c.top / (c.height - innerHeight));
  callCard.dataset.step = q < 0.08 ? 0 : q < 0.28 ? 1 : q < 0.48 ? 2 : q < 0.66 ? 3 : 4;

  const mid = innerHeight * 0.5;
  act = "wander";
  for (const [el, name] of ACTS) { const b = el.getBoundingClientRect(); if (b.top < mid && b.bottom > mid * 0.4) act = name; }
  document.body.dataset.act = act;
}
addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(onScroll); } }, { passive: true });
addEventListener("resize", onScroll);
onScroll();

// ---- Entrances ----------------------------------------------------------------
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.2 });
$$(".reveal").forEach((el) => io.observe(el));

// ---- Notes: peek at one person's private wish -------------------------------
$$(".note").forEach((b) => b.addEventListener("click", () => {
  const on = b.getAttribute("aria-pressed") !== "true";
  $$(".note").forEach((x) => x.setAttribute("aria-pressed", "false"));
  b.setAttribute("aria-pressed", String(on));
}));

// ---- The argument: bubbles cycle their lines while in view -------------------
const says = $$(".say");
let sayTimer = null, sayIdx = 0;
new IntersectionObserver(([e]) => {
  clearInterval(sayTimer);
  if (!e.isIntersecting || reduce) return;
  sayTimer = setInterval(() => {
    sayIdx++;
    says.forEach((s, i) => setTimeout(() => {
      const lines = s.dataset.lines.split("|");
      s.classList.add("swap");
      setTimeout(() => { s.textContent = lines[sayIdx % lines.length]; s.classList.remove("swap"); }, 260);
    }, i * 200));
  }, 2600);
}, { threshold: 0.4 }).observe($("#argue"));


// ---- Scene cards lean toward the pointer ------------------------------------
$$(".scene-card").forEach((card) => {
  card.addEventListener("pointermove", (ev) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty("--ty", (((ev.clientX - r.left) / r.width - 0.5) * 8).toFixed(2));
    card.style.setProperty("--tx", (-((ev.clientY - r.top) / r.height - 0.5) * 6).toFixed(2));
  });
  card.addEventListener("pointerleave", () => { card.style.setProperty("--ty", 0); card.style.setProperty("--tx", 0); });
});

// ---- Postcard: the play button sets the four off dancing ---------------------
$("#play").addEventListener("click", () => $("#cardVideo").classList.toggle("party"));

// ---- Walkers: doodled people living in the hills -----------------------------
const stage = $("#walkers");
const small = innerWidth < 760;
const people = [];
function addWalker(look, opts) {
  const el = document.createElement("div");
  el.className = "walker pose-walk";
  el.innerHTML = `<p class="w-bubble"></p><div class="w-flip">${figure(look)}</div>`;
  stage.appendChild(el);
  const w = { el, bubble: el.firstElementChild, flip: el.lastElementChild, x: rand(0.08, 0.92) * innerWidth, target: null, wait: rand(0, 2), dir: 1, said: rand(0, 2), ...opts };
  el.style.setProperty("--s", w.scale);
  el.style.bottom = w.lane + "%";
  el.style.zIndex = Math.round(100 - w.lane);
  people.push(w);
  return w;
}
const friends = FRIENDS.map((f, i) => addWalker(f, { friend: true, i, lines: f, lane: [4, 9, 6, 11][i], scale: small ? 0.62 : [1, 0.9, 0.96, 0.86][i], speed: rand(70, 95) }));
(small ? EXTRAS.slice(0, 2) : EXTRAS).forEach((e, i) => addWalker({ ...e, boil: false }, { friend: false, lane: [27, 31, 24, 34][i], scale: small ? 0.32 : [0.42, 0.36, 0.48, 0.32][i], speed: rand(28, 45) }));

function say(w, text) {
  if (w.bubble.dataset.t === text) return;
  w.bubble.dataset.t = text;
  w.bubble.innerHTML = text === "lock" ? LOCK : text;
  w.bubble.classList.toggle("show", !!text);
}
function setPose(w, pose) { if (w.pose !== pose) { w.el.className = "walker pose-" + pose; w.pose = pose; } }

// Where the four friends gather for each act.
function spot(act, i) {
  const gap = (small ? 46 : 78) * friends[i].scale * (act === "huddle" ? 0.5 : 1);
  const at = { argue: small ? 0.5 : 0.24, call: small ? 0.5 : 0.3, huddle: 0.5 }[act];
  return at * innerWidth + (i - 1.5) * gap;
}

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  for (const w of people) {
    let target = null, idle = "idle";
    if (!w.friend || act === "wander") {
      // amble: pick a spot, walk there, stand around a moment, repeat
      if (w.target == null && (w.wait -= dt) <= 0) w.target = rand(0.04, 0.96) * innerWidth;
      target = w.target;
      if (w.friend && (w.said -= dt) <= 0) {
        say(w, Math.random() < 0.55 ? w.lines.wander[Math.floor(Math.random() * w.lines.wander.length)] : "");
        w.said = rand(2.5, 5);
      }
    } else if (act === "private") {
      idle = "phone"; say(w, "lock");
    } else {
      target = spot(act, w.i);
      if (act === "argue") { idle = "argue"; say(w, w.lines.argue[Math.floor(now / 1800 + w.i) % 2]); }
      if (act === "call") { idle = w.i === 1 ? "ear" : "wave"; say(w, w.i === 1 ? "ring ring!" : ""); }
      if (act === "huddle") { idle = "huddle"; say(w, w.i === 0 ? "booked!" : ""); }
    }
    // Reduced motion: nobody ambles; friends step straight to their spot for each act.
    if (reduce) { if (target != null && w.friend && act !== "wander") w.x = target; target = null; }
    const moving = target != null && Math.abs(target - w.x) > 4;
    if (moving) {
      w.dir = Math.sign(target - w.x);
      w.x += w.dir * Math.min(Math.abs(target - w.x), w.speed * (w.friend && act !== "wander" ? 3.2 : 1) * dt);
      setPose(w, "walk");
    } else {
      if (w.target != null && (!w.friend || act === "wander")) { w.target = null; w.wait = rand(0.6, 2.4); }
      setPose(w, idle);
      if (w.friend && act !== "wander" && act !== "private") w.dir = w.i < 2 ? 1 : -1; // face the group
    }
    w.el.style.transform = `translateX(${w.x.toFixed(1)}px)`;
    w.flip.style.transform = `scaleX(${w.dir})`;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
