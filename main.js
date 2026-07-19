/* Cole McLauchlan — portfolio
   1. scroll reveal
   2. drag-to-scroll work rail
   3. the ASCII galaxy — an interactive full-screen spiral behind the hero
   3b. terminal typewriter
   4. project library dialogs */

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- 1. scroll reveal ---------- */

const revealEls = document.querySelectorAll(".reveal");
if (reducedMotion || !("IntersectionObserver" in window)) {
  revealEls.forEach((el) => el.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12 }
  );
  revealEls.forEach((el) => revealObserver.observe(el));
}

/* ---------- 2. drag-to-scroll rail (mouse only; touch scrolls natively) ---------- */

const viewport = document.querySelector(".rail-viewport");
if (viewport) {
  let dragging = false;
  let startX = 0;
  let startLeft = 0;
  let moved = 0;

  viewport.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    dragging = true;
    moved = 0;
    startX = e.clientX;
    startLeft = viewport.scrollLeft;
    viewport.classList.add("is-dragging");
    viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    viewport.scrollLeft = startLeft - dx;
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    viewport.classList.remove("is-dragging");
  };
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  // A drag should not count as a click on a card.
  viewport.addEventListener(
    "click",
    (e) => {
      if (moved > 6) {
        e.preventDefault();
        e.stopPropagation();
        moved = 0;
      }
    },
    true
  );
}

/* ---------- 3. the ASCII galaxy ---------- */
/* A tilted spiral galaxy drawn entirely in glyphs fills the hero: four arms
   with differential rotation, a glowing core, a dense twinkling starfield
   with green phosphor stars, drifting nebula, and shooting stars.
   It reacts to the cursor — nearby stars scatter and light up, a constellation
   web is drawn to the pointer, and a click detonates a supernova ring. */

const canvas = document.getElementById("sky-canvas");

if (canvas) {
  const ctx = canvas.getContext("2d");
  const BASE = "#f2f1ec";
  const GREEN = "#7dffa3";
  const PULSAR = "#56d364";
  const STAR_CHARS = "·:+*";
  const CORE_CHARS = "@#%*✦".replace("✦", "*"); // keep it mono-safe

  let width = 0;
  let height = 0;
  let cell = 15;
  let gx = 0; // galaxy center
  let gy = 0;
  let rMax = 400;
  let R = 200; // cursor influence radius
  const TILT = -0.32;
  const cosT = Math.cos(TILT);
  const sinT = Math.sin(TILT);
  let stars = [];
  let sparkles = [];
  let arms = [];
  let core = [];
  let nebula = [];
  let shooting = null;
  let nextShot = 3;
  let bursts = [];
  let pulsar = { x: 0, y: 0 };
  let running = false;
  let rafId = 0;
  let lastTime = 0;
  let t = 0;
  const pointer = { x: 0.5, y: 0.5 }; // normalized, for parallax
  const mouse = { x: -9999, y: -9999, active: false };
  const par = { x: 0, y: 0 };

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (s) => s[(Math.random() * s.length) | 0];

  function fit() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = width > 760 ? 15 : 13;

    const wide = width > 900;
    gx = width * (wide ? 0.62 : 0.5);
    gy = height * (wide ? 0.46 : 0.36);
    rMax = Math.max(width, height) * 0.6;
    R = Math.min(240, Math.min(width, height) * 0.26);
    pulsar = { x: width * 0.86, y: height * 0.2 };

    // dense starfield
    stars = [];
    const n = Math.round((width * height) / 5200);
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        dx: 0,
        dy: 0,
        ch: pick(STAR_CHARS),
        base: rand(0.06, 0.24),
        amp: rand(0.03, 0.13),
        ph: rand(0, Math.PI * 2),
        tw: rand(0.25, 1.1),
        green: Math.random() < 0.22,
      });
    }

    // bright cross-sparkle stars
    sparkles = [];
    for (let i = 0; i < (wide ? 9 : 5); i++) {
      sparkles.push({
        x: rand(width * 0.05, width * 0.97),
        y: rand(height * 0.05, height * 0.92),
        ph: rand(0, Math.PI * 2),
        tw: rand(0.15, 0.45),
        green: Math.random() < 0.35,
      });
    }

    // spiral arms
    arms = [];
    const ARMS = 6;
    const perArm = wide ? 190 : 95;
    for (let a = 0; a < ARMS; a++) {
      for (let i = 0; i < perArm; i++) {
        const f = i / perArm;
        arms.push({
          arm: (a / ARMS) * Math.PI * 2,
          f,
          theta0: f * 4.2 + rand(-0.12, 0.12),
          rj: rand(0.88, 1.14),
          ch: pick(STAR_CHARS),
          base: 0.1 + (1 - f) * 0.22 + rand(0, 0.06),
          ph: rand(0, Math.PI * 2),
          green: f < 0.4 && Math.random() < 0.32,
        });
      }
    }

    // galactic core
    core = [];
    for (let i = 0; i < (wide ? 90 : 52); i++) {
      const a = rand(0, Math.PI * 2);
      const r = Math.pow(Math.random(), 1.7) * rMax * 0.06;
      core.push({
        a,
        r,
        ch: pick(CORE_CHARS),
        base: rand(0.32, 0.72),
        ph: rand(0, Math.PI * 2),
      });
    }

    // drifting nebula clouds
    nebula = [];
    for (let i = 0; i < 4; i++) {
      nebula.push({
        ox: rand(-0.28, 0.32),
        oy: rand(-0.3, 0.3),
        r: rand(0.24, 0.42),
        green: i % 2 === 0,
        ph: rand(0, Math.PI * 2),
        sp: rand(0.05, 0.14),
      });
    }
  }

  function galaxyPoint(theta, r, depth) {
    const ex = Math.cos(theta) * r;
    const ey = Math.sin(theta) * r * 0.55;
    return [
      gx + ex * cosT - ey * sinT + par.x * depth,
      gy + ex * sinT + ey * cosT + par.y * depth,
    ];
  }

  function drawFrame(dt) {
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${cell - 3}px "IBM Plex Mono", Consolas, monospace`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.lineWidth = 1;

    // stronger parallax toward the cursor
    const tx = (pointer.x - 0.5) * 2;
    const ty = (pointer.y - 0.5) * 2;
    const k = Math.min(1, dt * 2.6);
    par.x += (tx * 16 - par.x) * k;
    par.y += (ty * 10 - par.y) * k;

    // nebula clouds (soft, luminous — presence)
    for (const neb of nebula) {
      const nx = gx + neb.ox * rMax + Math.sin(t * neb.sp + neb.ph) * 22 + par.x * 1.2;
      const ny = gy + neb.oy * rMax + Math.cos(t * neb.sp + neb.ph) * 16 + par.y * 1.2;
      const rad = neb.r * rMax;
      const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, rad);
      const tint = neb.green ? "125, 255, 163" : "200, 220, 235";
      g.addColorStop(0, `rgba(${tint}, ${0.05 + 0.02 * Math.sin(t * 0.5 + neb.ph)})`);
      g.addColorStop(1, `rgba(${tint}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(nx - rad, ny - rad, rad * 2, rad * 2);
    }

    // glowing core
    const coreGlow = ctx.createRadialGradient(gx + par.x, gy + par.y, 0, gx + par.x, gy + par.y, rMax * 0.26);
    coreGlow.addColorStop(0, "rgba(150, 255, 190, 0.16)");
    coreGlow.addColorStop(0.4, "rgba(120, 200, 165, 0.06)");
    coreGlow.addColorStop(1, "rgba(120, 200, 165, 0)");
    ctx.fillStyle = coreGlow;
    ctx.fillRect(gx + par.x - rMax * 0.26, gy + par.y - rMax * 0.26, rMax * 0.52, rMax * 0.52);

    // cursor halo
    if (mouse.active) {
      const hg = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, R * 0.9);
      hg.addColorStop(0, "rgba(125, 255, 163, 0.10)");
      hg.addColorStop(1, "rgba(125, 255, 163, 0)");
      ctx.fillStyle = hg;
      ctx.fillRect(mouse.x - R, mouse.y - R, R * 2, R * 2);
    }

    // starfield + cursor scatter, collecting near stars for the constellation web
    const nearStars = [];
    const R2 = R * R;
    for (const s of stars) {
      // repulsion target
      let txp = 0;
      let typ = 0;
      let boost = 0;
      if (mouse.active) {
        const ddx = s.x + s.dx - mouse.x;
        const ddy = s.y + s.dy - mouse.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < R2 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const force = (1 - d / R);
          txp = (ddx / d) * force * R * 0.32;
          typ = (ddy / d) * force * R * 0.32;
          boost = force * 0.6;
        }
      }
      // ease displacement (springy return)
      s.dx += (txp - s.dx) * Math.min(1, dt * 6);
      s.dy += (typ - s.dy) * Math.min(1, dt * 6);

      const x = s.x + s.dx + par.x * 0.6;
      const y = s.y + s.dy + par.y * 0.6;
      const alpha = Math.max(0, s.base + s.amp * Math.sin(t * s.tw + s.ph) + boost);
      ctx.fillStyle = s.green ? GREEN : BASE;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.fillText(s.ch, x, y);

      if (boost > 0.12 && nearStars.length < 18) nearStars.push({ x, y });
    }

    // constellation web to the cursor (hacker network aesthetic)
    if (mouse.active && nearStars.length) {
      ctx.strokeStyle = GREEN;
      for (const ns of nearStars) {
        const dx = ns.x - mouse.x;
        const dy = ns.y - mouse.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const a = Math.max(0, 1 - d / R);
        ctx.globalAlpha = a * a * 0.55;
        ctx.beginPath();
        ctx.moveTo(mouse.x, mouse.y);
        ctx.lineTo(ns.x, ns.y);
        ctx.stroke();
      }
      // link nearby pairs into a web
      const link = R * 0.52;
      for (let i = 0; i < nearStars.length; i++) {
        for (let j = i + 1; j < nearStars.length; j++) {
          const dx = nearStars[i].x - nearStars[j].x;
          const dy = nearStars[i].y - nearStars[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < link) {
            ctx.globalAlpha = (1 - d / link) * 0.2;
            ctx.beginPath();
            ctx.moveTo(nearStars[i].x, nearStars[i].y);
            ctx.lineTo(nearStars[j].x, nearStars[j].y);
            ctx.stroke();
          }
        }
      }
      // pointer node
      ctx.fillStyle = GREEN;
      ctx.globalAlpha = 0.85;
      ctx.fillText("+", mouse.x, mouse.y);
    }

    // bright cross-sparkle stars
    for (const s of sparkles) {
      const a = Math.max(0, 0.14 + 0.22 * Math.sin(t * s.tw + s.ph));
      const x = s.x + par.x * 0.8;
      const y = s.y + par.y * 0.8;
      ctx.fillStyle = s.green ? GREEN : BASE;
      ctx.globalAlpha = a * 1.7;
      ctx.fillText("*", x, y);
      ctx.globalAlpha = a * 0.6;
      ctx.fillText("·", x - cell, y);
      ctx.fillText("·", x + cell, y);
      ctx.fillText("·", x, y - cell);
      ctx.fillText("·", x, y + cell);
    }

    // spiral arms — inner particles orbit faster
    for (const p of arms) {
      const theta = p.theta0 + p.arm + t * (0.028 + 0.06 * Math.pow(1 - p.f, 1.3));
      const r = (24 + Math.pow(p.f, 0.82) * rMax) * p.rj;
      const [x, y] = galaxyPoint(theta, r, 1.8);
      if (x < -20 || x > width + 20 || y < -20 || y > height + 20) continue;
      let a = p.base * (0.72 + 0.28 * Math.sin(t * 0.8 + p.ph));
      if (mouse.active) {
        const dx = x - mouse.x;
        const dy = y - mouse.y;
        if (dx * dx + dy * dy < R2) a += (1 - Math.sqrt(dx * dx + dy * dy) / R) * 0.4;
      }
      ctx.fillStyle = p.green ? GREEN : BASE;
      ctx.globalAlpha = Math.min(1, a);
      ctx.fillText(p.ch, x, y);
    }

    // core glyphs
    ctx.fillStyle = BASE;
    for (const p of core) {
      const theta = p.a + t * 0.1;
      const [x, y] = galaxyPoint(theta, p.r, 2.3);
      ctx.globalAlpha = Math.min(1, p.base * (0.78 + 0.22 * Math.sin(t * 1.5 + p.ph)));
      ctx.fillText(p.ch, x, y);
    }

    // supernova bursts (from clicks)
    for (const b of bursts) {
      b.age += dt;
      const life = 1.2;
      const p = b.age / life;
      if (p >= 1) continue;
      const r = 16 + b.age * 320;
      const fade = 1 - p;
      const count = Math.max(10, Math.floor(r / 9));
      ctx.fillStyle = b.age < 0.4 ? GREEN : BASE;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + b.age * 1.4;
        const x = b.x + Math.cos(a) * r;
        const y = b.y + Math.sin(a) * r * 0.92;
        ctx.globalAlpha = fade * 0.6;
        ctx.fillText(fade > 0.55 ? "*" : "·", x, y);
      }
      if (b.age < 0.22) {
        ctx.fillStyle = GREEN;
        ctx.globalAlpha = 1 - b.age / 0.22;
        ctx.fillText("*", b.x, b.y);
      }
    }
    bursts = bursts.filter((b) => b.age < 1.2);

    // shooting stars (frequent)
    if (!reducedMotion) {
      if (!shooting && t > nextShot) {
        const fromLeft = Math.random() < 0.5;
        shooting = {
          x: fromLeft ? rand(-40, width * 0.25) : rand(width * 0.75, width + 40),
          y: rand(0, height * 0.4),
          vx: (fromLeft ? 1 : -1) * rand(540, 800),
          vy: rand(150, 280),
          life: 0,
          green: Math.random() < 0.4,
        };
      }
      if (shooting) {
        shooting.life += dt;
        shooting.x += shooting.vx * dt;
        shooting.y += shooting.vy * dt;
        const fade = Math.max(0, 1 - shooting.life / 0.9);
        ctx.fillStyle = shooting.green ? GREEN : BASE;
        ctx.globalAlpha = 0.85 * fade;
        ctx.fillText("*", shooting.x, shooting.y);
        for (let i = 1; i <= 8; i++) {
          ctx.globalAlpha = 0.85 * fade * (1 - i / 9);
          ctx.fillText(
            i < 3 ? ":" : "·",
            shooting.x - shooting.vx * i * 0.015,
            shooting.y - shooting.vy * i * 0.015
          );
        }
        if (fade <= 0 || shooting.x < -80 || shooting.x > width + 80) {
          shooting = null;
          nextShot = t + rand(3.5, 8);
        }
      }
    }

    // the pulsar — brighter, with rotating rays
    const pa = Math.max(0.12, 0.42 + 0.32 * Math.sin(t * 0.8));
    ctx.fillStyle = PULSAR;
    ctx.globalAlpha = pa;
    ctx.fillText("*", pulsar.x, pulsar.y);
    const rays = 0.5 + 0.5 * Math.sin(t * 0.8);
    const reach = 1 + Math.round(rays * 2);
    for (let i = 1; i <= reach; i++) {
      ctx.globalAlpha = pa * (1 - i / (reach + 1)) * 0.7;
      ctx.fillText("·", pulsar.x - cell * i, pulsar.y);
      ctx.fillText("·", pulsar.x + cell * i, pulsar.y);
      ctx.fillText("·", pulsar.x, pulsar.y - cell * i);
      ctx.fillText("·", pulsar.x, pulsar.y + cell * i);
    }

    ctx.fillStyle = BASE;
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    t += dt;
    drawFrame(dt);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (running || reducedMotion) return;
    running = true;
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  function toCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return [clientX - rect.left, clientY - rect.top];
  }

  window.addEventListener("pointermove", (e) => {
    pointer.x = e.clientX / Math.max(1, window.innerWidth);
    pointer.y = e.clientY / Math.max(1, window.innerHeight);
    const [x, y] = toCanvas(e.clientX, e.clientY);
    mouse.x = x;
    mouse.y = y;
    mouse.active = x >= -R && x <= width + R && y >= -R && y <= height + R;
  });
  document.addEventListener("mouseleave", () => (mouse.active = false));

  // click / tap detonates a supernova on the galaxy
  window.addEventListener("pointerdown", (e) => {
    if (reducedMotion || !running) return;
    const [x, y] = toCanvas(e.clientX, e.clientY);
    if (x < 0 || y < 0 || x > width || y > height) return;
    bursts.push({ x, y, age: 0 });
    if (bursts.length > 6) bursts.shift();
  });

  fit();
  if (reducedMotion) {
    t = 2.2;
    drawFrame(0);
  } else {
    start();

    const skyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => (e.isIntersecting ? start() : stop()));
      },
      { threshold: 0.03 }
    );
    skyObserver.observe(canvas);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else start();
    });
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      fit();
      if (reducedMotion) drawFrame(0);
    }, 150);
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      fit();
      if (reducedMotion) drawFrame(0);
    });
  }
}

/* ---------- 3b. terminal typewriter ---------- */

const termCmd = document.querySelector(".term-cmd");
if (termCmd && !reducedMotion) {
  const full = termCmd.textContent;
  termCmd.textContent = "";
  let i = 0;
  const typeNext = () => {
    i += 1;
    termCmd.textContent = full.slice(0, i);
    if (i < full.length) {
      setTimeout(typeNext, 55 + Math.random() * 75);
    }
  };
  setTimeout(typeNext, 520);
}

/* ---------- 4. project library dialogs ---------- */

document.querySelectorAll("[data-dialog]").forEach((card) => {
  const dlg = document.getElementById(card.dataset.dialog);
  if (!dlg) return;
  card.addEventListener("click", () => {
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  });
});

document.querySelectorAll("dialog.project-dialog").forEach((dlg) => {
  // click on the backdrop closes
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
  const closeBtn = dlg.querySelector(".dialog-close");
  if (closeBtn) closeBtn.addEventListener("click", () => dlg.close());
});

/* ---------- 5. spinning ASCII donut (the classic torus, matrix-green) ---------- */

const donutEl = document.getElementById("donut");
if (donutEl) {
  const CH = ".,-~:;=!*#$@";
  const W = 58;
  const H = 28;
  const cx = W / 2;
  const cy = H / 2;
  const K2 = 5; // distance from viewer
  const XS = 18; // horizontal scale
  const YS = 9; // vertical scale (~half — compensates for tall character cells)
  let A = 0;
  let B = 0;
  let dRunning = false;
  let dRaf = 0;
  let dLast = 0;

  function renderDonut(dt) {
    A += 1.3 * dt;
    B += 0.7 * dt;
    const cosA = Math.cos(A);
    const sinA = Math.sin(A);
    const cosB = Math.cos(B);
    const sinB = Math.sin(B);
    const out = new Array(W * H).fill(" ");
    const zbuf = new Float32Array(W * H);

    for (let theta = 0; theta < 6.283; theta += 0.09) {
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const circlex = 2 + ct; // R2 + R1*cos(theta)
      const circley = st; // R1*sin(theta)
      for (let phi = 0; phi < 6.283; phi += 0.02) {
        const cp = Math.cos(phi);
        const sp = Math.sin(phi);
        const x = circlex * (cosB * cp + sinA * sinB * sp) - circley * cosA * sinB;
        const y = circlex * (sinB * cp - sinA * cosB * sp) + circley * cosA * cosB;
        const z = K2 + cosA * circlex * sp + circley * sinA;
        const ooz = 1 / z;
        const xp = Math.round(cx + XS * ooz * x);
        const yp = Math.round(cy - YS * ooz * y);
        if (xp < 0 || xp >= W || yp < 0 || yp >= H) continue;
        const L =
          cp * ct * sinB -
          cosA * ct * sp -
          sinA * st +
          cosB * (cosA * st - ct * sinA * sp);
        if (L > 0) {
          const idx = yp * W + xp;
          if (ooz > zbuf[idx]) {
            zbuf[idx] = ooz;
            const lum = Math.min(CH.length - 1, Math.max(0, (L * 8) | 0));
            out[idx] = CH[lum];
          }
        }
      }
    }

    let s = "";
    for (let r = 0; r < H; r++) {
      s += out.slice(r * W, r * W + W).join("");
      if (r < H - 1) s += "\n";
    }
    donutEl.textContent = s;
  }

  function donutLoop(now) {
    if (!dRunning) return;
    const dt = Math.min((now - dLast) / 1000, 0.05);
    dLast = now;
    renderDonut(dt);
    dRaf = requestAnimationFrame(donutLoop);
  }
  function donutStart() {
    if (dRunning || reducedMotion) return;
    dRunning = true;
    dLast = performance.now();
    dRaf = requestAnimationFrame(donutLoop);
  }
  function donutStop() {
    dRunning = false;
    cancelAnimationFrame(dRaf);
  }

  if (reducedMotion) {
    A = 1.0;
    B = 0.5;
    renderDonut(0);
  } else if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.isIntersecting ? donutStart() : donutStop())),
      { threshold: 0.05 }
    );
    io.observe(donutEl);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) donutStop();
      else donutStart();
    });
  } else {
    donutStart();
  }
}
