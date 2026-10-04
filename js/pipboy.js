/* ==========================================================================
   PIP-OS INTERFACE KIT v1.0 — pipboy.js

   Behaviours for pipboy.css. Everything is opt-in through markup and wires
   itself up when the DOM is ready. Call Pip.init(root) after adding markup.

   Markup hooks                         Events (bubble from the element)
     [data-pip-tabs]      tablists        pip:tab      { tab, index }
     [data-pip-list]      listboxes       pip:select   { option, index }
     .pip-segmented       radiogroups     pip:change   { value }
     .pip-toggle          switches        pip:change   { value }
     [data-pip-stepper]   steppers        pip:change   { value }
     [data-pip-pager]     pagers          pip:page     { page }
     .pip-range           ranges          (native input event)
     .pip-btn--hold       hold-to-confirm pip:confirm
     .pip-meter           meters
     [data-pip-type]      typewriter      pip:typed
     [data-pip-scope]     oscilloscope
     [data-pip-map]       contour map     pip:marker   { marker }
     [data-pip-compass]   compass strip
     [data-pip-hack]      password game   pip:unlocked / pip:locked
     [data-pip-phosphor-switch]  tube picker (a .pip-segmented)
     [data-pip-fx="scan|roll|glow|flicker"]  effect checkboxes

   API: Pip.setPhosphor(id), Pip.setFx(name, on), Pip.toast(opts),
        Pip.confirm(opts) -> Promise<boolean>, Pip.type(el), Pip.power(el, mode),
        Pip.setMeter(el, value, rads), Pip.compass(el).set(deg), Pip.scope(el).set(opts)
   ========================================================================== */

(() => {
  "use strict";

  const root = document.documentElement;
  const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => motionQuery.matches;

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } },
  };

  const emit = (el, name, detail = {}) =>
    el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));

  const once = (el, key) => {
    const flag = "pipReady" + key;
    if (el.dataset[flag]) return false;
    el.dataset[flag] = "1";
    return true;
  };

  /* Tubes ----------------------------------------------------------------- */

  const TUBES = {
    p1: { name: "P1", color: "Green", nm: "525 nm" },
    p3: { name: "P3", color: "Amber", nm: "602 nm" },
    p4: { name: "P4", color: "White", nm: "Broadband" },
    p7: { name: "P7", color: "Blue", nm: "440 nm" },
  };

  function setPhosphor(id, { persist = true } = {}) {
    if (!TUBES[id]) return;
    root.dataset.phosphor = id;
    if (persist) store.set("pip-os:phosphor", id);
    document.querySelectorAll("[data-pip-phosphor-switch] > [role=radio]").forEach((btn) =>
      btn.setAttribute("aria-checked", String(btn.value === id)));
    emit(document, "pip:phosphor", { id, tube: TUBES[id] });
  }

  /* Screen effects -------------------------------------------------------- */

  const FX = ["scan", "roll", "glow", "flicker"];

  function setFx(name, on, { persist = true } = {}) {
    if (!FX.includes(name)) return;
    root.classList.toggle("pip-no-" + name, !on);
    if (persist) {
      const off = FX.filter((fx) => root.classList.contains("pip-no-" + fx));
      store.set("pip-os:fx-off", off.join(","));
    }
    document.querySelectorAll(`[data-pip-fx="${name}"]`).forEach((input) => { input.checked = on; });
  }

  // Restore the viewer's tube and effects before anything else draws.
  const savedTube = store.get("pip-os:phosphor");
  if (savedTube && TUBES[savedTube]) root.dataset.phosphor = savedTube;
  else if (!root.dataset.phosphor) root.dataset.phosphor = "p1";
  (store.get("pip-os:fx-off") || "").split(",").filter(Boolean)
    .forEach((fx) => root.classList.add("pip-no-" + fx));

  /* Tabs ------------------------------------------------------------------ */

  function initTabs(list) {
    if (!once(list, "Tabs")) return;
    const tabs = [...list.querySelectorAll(":scope > [role=tab]")];
    if (!tabs.length) return;
    const panelOf = (t) => document.getElementById(t.getAttribute("aria-controls") || "");

    // Hide every other panel first, then show the active one, so several
    // tabs may share a single panel that the page re-renders.
    const apply = (tab) => {
      const index = tabs.indexOf(tab);
      tabs.forEach((t, i) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        t.style.setProperty("--d", Math.abs(i - index));
        const panel = panelOf(t);
        if (panel && !on) panel.hidden = true;
      });
      const panel = panelOf(tab);
      if (panel) panel.hidden = false;
      return index;
    };

    const select = (tab, focus = false) => {
      const index = apply(tab);
      if (focus) tab.focus();
      list.scrollTo?.({ left: tab.offsetLeft - list.clientWidth / 2 + tab.offsetWidth / 2 });
      emit(list, "pip:tab", { tab, index });
    };

    list.addEventListener("click", (e) => {
      const tab = e.target.closest("[role=tab]");
      if (tab && tabs.includes(tab)) select(tab);
    });
    list.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], true);
    });

    apply(tabs.find((t) => t.getAttribute("aria-selected") === "true") || tabs[0]);
    list.pipSelect = select;
  }

  /* Pager ----------------------------------------------------------------- */

  // [data-pip-pager] data-page data-pages, with two .pip-arrow buttons and a .pip-pager__label.
  function initPager(el) {
    if (!once(el, "Pager")) return;
    const [prev, next] = el.querySelectorAll(".pip-arrow");
    const label = el.querySelector(".pip-pager__label");
    const pages = Number(el.dataset.pages || 1);
    let page = Number(el.dataset.page || 1);
    if (label) label.setAttribute("aria-live", "polite");
    const render = () => {
      el.dataset.page = page;
      if (label) label.textContent = `Page ${page} of ${pages}`;
      prev.disabled = page <= 1;
      next.disabled = page >= pages;
    };
    const go = (step) => {
      const target = Math.max(1, Math.min(pages, page + step));
      if (target === page) return;
      page = target;
      render();
      emit(el, "pip:page", { page });
    };
    prev.addEventListener("click", () => go(-1));
    next.addEventListener("click", () => go(1));
    render();
  }

  /* Listbox --------------------------------------------------------------- */

  function initList(list) {
    if (!once(list, "List")) return;
    const options = () => [...list.querySelectorAll(":scope > [role=option]")];

    const select = (option, { focus = false, silent = false } = {}) => {
      const all = options();
      all.forEach((o) => {
        const on = o === option;
        o.setAttribute("aria-selected", String(on));
        o.tabIndex = on ? 0 : -1;
      });
      if (focus) option.focus();   // focus() scrolls the row into view when needed
      if (!silent) emit(list, "pip:select", { option, index: all.indexOf(option) });
    };

    list.addEventListener("click", (e) => {
      const option = e.target.closest("[role=option]");
      if (option && option.parentElement === list) select(option);
    });
    list.addEventListener("keydown", (e) => {
      const all = options();
      const i = all.indexOf(document.activeElement);
      if (i < 0) return;
      const next = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(all[Math.max(0, Math.min(all.length - 1, next))], { focus: true });
    });

    const all = options();
    const initial = all.find((o) => o.getAttribute("aria-selected") === "true") || all[0];
    all.forEach((o) => { o.tabIndex = o === initial ? 0 : -1; });
    if (initial) initial.setAttribute("aria-selected", "true");
    list.pipSelect = (option, opts) => select(option, opts);
  }

  /* Segmented, toggle, stepper, range ------------------------------------- */

  function initSegmented(group) {
    if (!once(group, "Seg")) return;
    const buttons = [...group.querySelectorAll(":scope > [role=radio]")];
    const select = (btn, focus = false) => {
      buttons.forEach((b) => {
        b.setAttribute("aria-checked", String(b === btn));
        b.tabIndex = b === btn ? 0 : -1;
      });
      if (focus) btn.focus();
      emit(group, "pip:change", { value: btn.value });
    };
    group.addEventListener("click", (e) => {
      const btn = e.target.closest("[role=radio]");
      if (btn && buttons.includes(btn)) select(btn);
    });
    group.addEventListener("keydown", (e) => {
      const i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      select(buttons[(i + step + buttons.length) % buttons.length], true);
    });
    const initial = buttons.find((b) => b.getAttribute("aria-checked") === "true") || buttons[0];
    buttons.forEach((b) => {
      b.setAttribute("aria-checked", String(b === initial));
      b.tabIndex = b === initial ? 0 : -1;
    });

    if (group.hasAttribute("data-pip-phosphor-switch")) {
      buttons.forEach((b) => b.setAttribute("aria-checked", String(b.value === root.dataset.phosphor)));
      buttons.forEach((b) => { b.tabIndex = b.value === root.dataset.phosphor ? 0 : -1; });
      group.addEventListener("pip:change", (e) => setPhosphor(e.detail.value));
    }
  }

  function initToggle(btn) {
    if (!once(btn, "Toggle")) return;
    if (!btn.hasAttribute("aria-checked")) btn.setAttribute("aria-checked", "false");
    btn.addEventListener("click", () => {
      const on = btn.getAttribute("aria-checked") !== "true";
      btn.setAttribute("aria-checked", String(on));
      emit(btn, "pip:change", { value: on });
    });
  }

  function initStepper(el) {
    if (!once(el, "Stepper")) return;
    const [dec, inc] = el.querySelectorAll("button");
    const out = el.querySelector("output");
    // Read limits live so pages can change data-min / data-max after init.
    const lim = () => [Number(el.dataset.min ?? 1), Number(el.dataset.max ?? 10)];
    let value = Number(el.dataset.value ?? out.textContent ?? lim()[0]);

    const render = () => {
      const [min, max] = lim();
      value = Math.max(min, Math.min(max, value));
      out.textContent = value;
      el.dataset.value = value;
      dec.disabled = value <= min || el.hasAttribute("data-lock-dec");
      inc.disabled = value >= max || el.hasAttribute("data-lock-inc");
    };
    const set = (v) => {
      const [min, max] = lim();
      const next = Math.max(min, Math.min(max, v));
      if (next === value) return;
      value = next;
      render();
      emit(el, "pip:change", { value });
    };
    dec.addEventListener("click", () => set(value - 1));
    inc.addEventListener("click", () => set(value + 1));
    el.pipSet = set;
    el.pipRender = render;
    render();
  }

  function syncRange(input) {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const pct = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty("--val", pct + "%");
  }
  function initRange(input) {
    if (!once(input, "Range")) return;
    input.addEventListener("input", () => syncRange(input));
    syncRange(input);
  }

  /* Hold to confirm ------------------------------------------------------- */

  function initHold(btn) {
    if (!once(btn, "Hold")) return;
    const duration = Number(btn.dataset.pipHold || 1000);
    let frame = 0;
    let start = 0;

    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      btn.style.setProperty("--hold", 0);
    };
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / duration);
      btn.style.setProperty("--hold", p);
      if (p < 1) { frame = requestAnimationFrame(tick); return; }
      reset();
      btn.dataset.done = "";
      setTimeout(() => delete btn.dataset.done, 450);
      emit(btn, "pip:confirm");
    };
    const begin = () => {
      if (btn.disabled || frame) return;
      start = performance.now();
      frame = requestAnimationFrame(tick);
    };

    btn.addEventListener("pointerdown", (e) => { if (e.button === 0) begin(); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((t) => btn.addEventListener(t, reset));
    btn.addEventListener("keydown", (e) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); begin(); }
    });
    btn.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") reset(); });
    btn.addEventListener("blur", reset);
  }

  /* Meters ---------------------------------------------------------------- */

  function setMeter(el, value, rads) {
    const max = Number(el.getAttribute("aria-valuemax") || 1);
    if (value !== undefined) el.setAttribute("aria-valuenow", value);
    if (rads !== undefined) el.dataset.rads = rads;
    const now = Number(el.getAttribute("aria-valuenow") || 0);
    const r = Number(el.dataset.rads || 0);
    el.style.setProperty("--value", Math.max(0, Math.min(1, now / max)));
    el.style.setProperty("--rads", Math.max(0, Math.min(1, r / max)));
    const readout = el.querySelector(".pip-meter__value[data-format]");
    if (readout) {
      readout.textContent = readout.dataset.format
        .replace("{value}", Math.round(now).toLocaleString())
        .replace("{max}", Math.round(max).toLocaleString())
        .replace("{pct}", Math.round((now / max) * 100));
    }
  }

  /* Toasts ---------------------------------------------------------------- */

  function toast({ title = "", body = "", icon = "!", timeout = 4200 } = {}) {
    let host = document.querySelector(".pip-toasts");
    if (!host) {
      host = document.createElement("div");
      host.className = "pip-toasts";
      host.setAttribute("role", "status");
      host.setAttribute("aria-live", "polite");
      document.body.append(host);
    }
    const el = document.createElement("div");
    el.className = "pip-toast";
    const iconEl = Object.assign(document.createElement("span"), { className: "pip-toast__icon", textContent: icon });
    iconEl.setAttribute("aria-hidden", "true");
    el.append(
      iconEl,
      Object.assign(document.createElement("span"), { className: "pip-toast__title", textContent: title }),
      Object.assign(document.createElement("span"), { className: "pip-toast__body", textContent: body }),
    );
    host.append(el);
    while (host.children.length > 4) host.firstElementChild.remove();

    setTimeout(() => {
      if (reduced()) { el.remove(); return; }
      el.classList.add("is-leaving");
      setTimeout(() => el.remove(), 320);
    }, timeout);
    return el;
  }

  /* Confirm dialog -------------------------------------------------------- */

  function confirm({ title = "Are you sure?", body = "", confirmLabel = "Yes", cancelLabel = "No", danger = false } = {}) {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "pip-dialog";
      const form = Object.assign(document.createElement("form"), { method: "dialog", className: "pip-dialog__body" });
      const heading = Object.assign(document.createElement("h2"), { textContent: title });
      const text = Object.assign(document.createElement("p"), { textContent: body });
      const actions = Object.assign(document.createElement("div"), { className: "pip-dialog__actions" });
      const cancel = Object.assign(document.createElement("button"), { className: "pip-btn", value: "cancel", textContent: cancelLabel });
      const ok = Object.assign(document.createElement("button"), {
        className: "pip-btn " + (danger ? "pip-btn--danger" : "pip-btn--primary"),
        value: "ok",
        textContent: confirmLabel,
      });
      actions.append(cancel, ok);
      form.append(heading);
      if (body) form.append(text);
      form.append(actions);
      dialog.append(form);
      document.body.append(dialog);
      dialog.addEventListener("close", () => {
        resolve(dialog.returnValue === "ok");
        dialog.remove();
      }, { once: true });
      dialog.showModal();
      cancel.focus();
    });
  }

  /* Typewriter ------------------------------------------------------------ */

  // Types each [data-line] (or .pip-terminal__line) child in turn.
  // Click or press a key inside the element to finish at once.
  function type(el, { cps = Number(el.dataset.pipCps || 70) } = {}) {
    const lines = [...el.querySelectorAll("[data-line], .pip-terminal__line")];
    if (!lines.length || reduced()) { emit(el, "pip:typed"); return Promise.resolve(); }

    const texts = lines.map((line) => (line.children.length ? null : line.textContent));
    lines.forEach((line, i) => {
      if (texts[i] !== null) line.textContent = "";
      line.style.visibility = "hidden";
    });
    el.setAttribute("aria-busy", "true");

    let skip = false;
    const finish = () => { skip = true; };
    el.addEventListener("click", finish, { once: true });
    el.addEventListener("keydown", finish, { once: true });

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    return (async () => {
      const cursor = Object.assign(document.createElement("span"), { className: "pip-cursor" });
      cursor.setAttribute("aria-hidden", "true");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        line.style.visibility = "";
        if (texts[i] === null || skip) {
          if (texts[i] !== null) line.textContent = texts[i];
          continue;
        }
        line.append(cursor);
        const text = texts[i];
        for (let c = 1; c <= text.length && !skip; c++) {
          line.textContent = text.slice(0, c);
          line.append(cursor);
          await wait(1000 / cps);
        }
        line.textContent = text;
        if (!skip) await wait(Number(line.dataset.pause || 90));
      }
      cursor.remove();
      el.removeAttribute("aria-busy");
      el.removeEventListener("click", finish);
      el.removeEventListener("keydown", finish);
      emit(el, "pip:typed");
    })();
  }

  /* Power on / off -------------------------------------------------------- */

  function power(el, mode = "on") {
    if (reduced()) return Promise.resolve();
    const run = (cls) => new Promise((resolve) => {
      el.classList.remove("pip-power-on", "pip-power-off");
      void el.offsetWidth;
      el.classList.add(cls);
      const done = (e) => {
        if (e.target !== el || !e.animationName.startsWith("pip-power")) return;
        el.removeEventListener("animationend", done);
        // Hand the element back to any other animation (e.g. .pip-flicker).
        // The off state stays applied until the next power-on.
        if (cls === "pip-power-on") el.classList.remove(cls);
        resolve();
      };
      el.addEventListener("animationend", done);
    });
    if (mode === "off") return run("pip-power-off");
    if (mode === "cycle") return run("pip-power-off").then(() => run("pip-power-on"));
    return run("pip-power-on");
  }

  /* Canvas helpers -------------------------------------------------------- */

  function fitCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: width, h: height };
  }

  // The resolved phosphor color for an element, as rgb().
  const phosColor = (el) => getComputedStyle(el).color;

  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Oscilloscope ---------------------------------------------------------- */

  function initScope(el) {
    if (!once(el, "Scope")) return;
    let canvas = el.querySelector("canvas");
    if (!canvas) { canvas = document.createElement("canvas"); el.append(canvas); }
    canvas.setAttribute("aria-hidden", "true");
    const state = {
      freq: Number(el.dataset.freq || 3),
      amp: Number(el.dataset.amp ?? .8),
      phase: 0,
    };
    let visible = true;

    const draw = () => {
      if (!el.offsetParent) return;
      const { ctx, w, h } = fitCanvas(canvas);
      const color = phosColor(el);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = .14;
      for (let i = 1; i < 8; i++) {
        const x = (w / 8) * i;
        const y = (h / 8) * i;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const t = (x / w) * Math.PI * 2;
        const wave = state.amp === 0
          ? (Math.random() - .5) * .04
          : state.amp * (.78 * Math.sin(t * state.freq + state.phase) + .22 * Math.sin(t * state.freq * 2.7 - state.phase * 1.4));
        const y = h / 2 - wave * h * .38;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const loop = () => {
      state.phase += .06;
      if (visible) draw();
      if (!reduced()) requestAnimationFrame(loop);
    };
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(el);
    }
    document.addEventListener("pip:phosphor", draw);
    window.addEventListener("resize", draw);
    el.pipScope = {
      set(opts = {}) { Object.assign(state, opts); draw(); },
      redraw: draw,
    };
    reduced() ? draw() : requestAnimationFrame(loop);
  }

  /* Contour map ----------------------------------------------------------- */

  function initMap(el) {
    if (!once(el, "Map")) return;
    let canvas = el.querySelector("canvas");
    if (!canvas) { canvas = document.createElement("canvas"); el.prepend(canvas); }
    canvas.setAttribute("aria-hidden", "true");
    const seed = Number(el.dataset.seed || 2287);

    const draw = () => {
      if (!el.offsetParent) return;
      const { ctx, w, h } = fitCanvas(canvas);
      const rand = seeded(seed);
      const color = phosColor(el);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = color;

      // Survey grid
      ctx.globalAlpha = .1;
      ctx.lineWidth = 1;
      const cell = Math.max(32, w / 14);
      for (let x = cell; x < w; x += cell) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = cell; y < h; y += cell) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      // Hills as wobbling contour rings
      const size = Math.min(w, h);
      for (let n = 0; n < 7; n++) {
        const cx = rand() * w;
        const cy = rand() * h;
        const r = size * (.12 + rand() * .22);
        const rings = 3 + Math.floor(rand() * 4);
        const ph = rand() * Math.PI * 2;
        const wob = .1 + rand() * .12;
        for (let i = 1; i <= rings; i++) {
          const rr = r * (i / rings);
          ctx.globalAlpha = i === rings ? .32 : .16 + i * .02;
          ctx.lineWidth = i === rings ? 1.5 : 1;
          ctx.beginPath();
          for (let a = 0; a <= Math.PI * 2 + .01; a += .08) {
            const k = 1 + wob * Math.sin(3 * a + ph + i) + wob * .5 * Math.sin(5 * a + ph * 2);
            const x = cx + Math.cos(a) * rr * k;
            const y = cy + Math.sin(a) * rr * k * .8;
            a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      // Roads: dashed random walks
      ctx.globalAlpha = .45;
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      for (let n = 0; n < 3; n++) {
        let x = rand() < .5 ? 0 : w;
        let y = rand() * h;
        let heading = x === 0 ? 0 : Math.PI;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 40; s++) {
          heading += (rand() - .5) * .7;
          x += Math.cos(heading) * w / 28;
          y += Math.sin(heading) * w / 28;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };

    el.addEventListener("click", (e) => {
      const marker = e.target.closest(".pip-map__marker");
      if (!marker) return;
      el.querySelectorAll(".pip-map__marker").forEach((m) =>
        m.setAttribute("aria-pressed", String(m === marker)));
      emit(el, "pip:marker", { marker });
    });
    el.querySelectorAll(".pip-map__marker").forEach((m) => m.setAttribute("aria-pressed", "false"));

    document.addEventListener("pip:phosphor", draw);
    new ResizeObserver(draw).observe(el);
    el.pipMap = { redraw: draw };
    draw();
  }

  /* Compass --------------------------------------------------------------- */

  const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

  function initCompass(el) {
    if (!once(el, "Compass")) return;
    const ppd = parseFloat(getComputedStyle(el).getPropertyValue("--ppd")) || 4;
    const strip = Object.assign(document.createElement("div"), { className: "pip-compass__strip" });
    strip.setAttribute("aria-hidden", "true");
    for (let d = -360; d <= 720; d += 15) {
      const tick = Object.assign(document.createElement("span"), { className: "pip-compass__tick" });
      tick.style.left = (d + 360) * ppd + "px";
      if (d % 45 === 0) {
        tick.classList.add("is-major");
        tick.textContent = DIRS[(((d % 360) + 360) % 360) / 45];
      }
      strip.append(tick);
    }
    let markers = [];
    try { markers = JSON.parse(el.dataset.markers || "[]"); } catch { markers = []; }
    markers.forEach(({ bearing, kind = "quest" }) => {
      [-360, 0, 360].forEach((offset) => {
        const m = Object.assign(document.createElement("span"), { className: "pip-compass__marker" });
        m.dataset.kind = kind;
        m.style.left = (bearing + offset + 360) * ppd + "px";
        strip.append(m);
      });
    });
    el.append(strip);
    el.setAttribute("role", "img");

    const set = (deg) => {
      const heading = ((Number(deg) % 360) + 360) % 360;
      el.style.setProperty("--heading", heading);
      el.dataset.heading = heading;
      el.setAttribute("aria-label", `Compass heading ${Math.round(heading)} degrees, ${DIRS[Math.round(heading / 45) % 8]}`);
    };
    el.pipCompass = { set };
    set(el.dataset.heading || 0);
  }

  /* Password minigame ----------------------------------------------------- */

  const HACK_WORDS = {
    5: "SCRAP,RADIO,VAULT,TOXIC,GHOUL,CRATE,WATER,PIPES,BOMBS,FUSES,CAPS,RIFLE,ROADS,FLAME,TRADE,SCOUT,GUARD,HOMES,BLAST,SHELL",
    7: "SHELTER,WARHEAD,RAIDERS,CANTEEN,OUTPOST,SURVIVE,BUNKERS,HOLDOUT,GENERAL,SETTLER,STATION,REACTOR,TRADERS,CAPSULE,MUTANTS,DESERTS,PATROLS,HARVEST,LOCKOUT,MACHINE,BATTERY,COMPASS",
  };
  const JUNK = "!@#$%^&*()-_=+[]{}<>?/\\|;:'\",.";

  // How many letters sit in the same position in both words.
  const likeness = (a, b) => [...a].reduce((n, ch, i) => n + (ch === b[i] ? 1 : 0), 0);

  function initHack(el) {
    if (!once(el, "Hack")) return;
    const length = Number(el.dataset.length || 7);
    const pool = (el.dataset.words || HACK_WORDS[length] || HACK_WORDS[7])
      .split(",").map((w) => w.trim().toUpperCase()).filter((w) => w.length === length);
    const ROWS = 16;
    const WIDTH = 12;
    const COLS = 2;

    const build = () => {
      const rand = Math.random;
      const words = [...pool].sort(() => rand() - .5).slice(0, Math.min(10, pool.length));
      const password = words[Math.floor(rand() * words.length)];
      let attempts = 4;
      const log = [];

      const rowCount = ROWS * COLS;
      const rows = Array.from({ length: rowCount }, () =>
        Array.from({ length: WIDTH }, () => JUNK[Math.floor(rand() * JUNK.length)]));
      const slots = [...Array(rowCount).keys()].sort(() => rand() - .5).slice(0, words.length);
      const placed = new Map(); // row -> { word, offset }
      words.forEach((word, i) => {
        placed.set(slots[i], { word, offset: Math.floor(rand() * (WIDTH - length + 1)) });
      });

      el.replaceChildren();
      const head = Object.assign(document.createElement("div"), { className: "pip-hack__head" });
      const status = document.createElement("p");
      head.append(
        Object.assign(document.createElement("p"), { textContent: "TERMLINK PROTOCOL" }),
        Object.assign(document.createElement("p"), { textContent: "ENTER PASSWORD NOW" }),
        status,
      );
      const grid = Object.assign(document.createElement("div"), { className: "pip-hack__grid" });
      const logEl = Object.assign(document.createElement("div"), { className: "pip-hack__log" });
      logEl.setAttribute("aria-live", "polite");

      const base = 0xf400 + Math.floor(rand() * 0x400) * 4;
      for (let c = 0; c < COLS; c++) {
        const col = Object.assign(document.createElement("div"), { className: "pip-hack__col" });
        for (let r = 0; r < ROWS; r++) {
          const index = c * ROWS + r;
          const row = Object.assign(document.createElement("div"), { className: "pip-hack__row" });
          const addr = Object.assign(document.createElement("span"), {
            className: "pip-hack__addr",
            textContent: "0x" + (base + index * WIDTH).toString(16).toUpperCase(),
          });
          const data = document.createElement("span");
          const chars = rows[index];
          const slot = placed.get(index);
          if (slot) {
            data.append(chars.slice(0, slot.offset).join(""));
            const btn = Object.assign(document.createElement("button"), {
              type: "button", className: "pip-hack__word", textContent: slot.word,
            });
            btn.dataset.word = slot.word;
            data.append(btn, chars.slice(slot.offset + length).join(""));
          } else {
            data.textContent = chars.join("");
          }
          row.append(addr, data);
          col.append(row);
        }
        grid.append(col);
      }
      grid.append(logEl);
      el.append(head, grid);

      const renderStatus = () => {
        status.replaceChildren();
        if (attempts === 1) {
          status.append(Object.assign(document.createElement("span"), {
            className: "pip-hack__warn pip-blink", textContent: "!!! WARNING: LOCKOUT IMMINENT !!!",
          }));
          status.append(document.createElement("br"));
        }
        status.append(`${attempts} ATTEMPT(S) LEFT:`);
        const pips = Object.assign(document.createElement("span"), { className: "pip-hack__tries" });
        pips.setAttribute("aria-hidden", "true");
        for (let i = 0; i < attempts; i++) pips.append(document.createElement("i"));
        status.append(pips);
      };
      const renderLog = () => { logEl.textContent = log.slice(-14).join("\n"); };

      const endScreen = (lines, event) => {
        setTimeout(() => {
          el.replaceChildren();
          const wrap = Object.assign(document.createElement("div"), { className: "pip-hack__head" });
          lines.forEach((text) => wrap.append(Object.assign(document.createElement("p"), { textContent: text })));
          const again = Object.assign(document.createElement("button"), {
            type: "button", className: "pip-btn pip-btn--small", textContent: "Reset terminal",
          });
          again.style.marginTop = "1em";
          again.addEventListener("click", build);
          wrap.append(again);
          el.append(wrap);
          again.focus();
          emit(el, event, { password });
        }, reduced() ? 0 : 900);
      };

      grid.addEventListener("click", (e) => {
        const btn = e.target.closest(".pip-hack__word");
        if (!btn || btn.disabled || attempts === 0) return;
        const guess = btn.dataset.word;
        btn.disabled = true;
        log.push(">" + guess);
        if (guess === password) {
          log.push(">Exact match!", ">Please wait", ">while system", ">is accessed.");
          renderLog();
          attempts = -1;
          endScreen(["ACCESS GRANTED", `PASSWORD: ${password}`], "pip:unlocked");
          return;
        }
        attempts -= 1;
        log.push(">Entry denied.", `>Likeness=${likeness(guess, password)}`);
        renderLog();
        renderStatus();
        if (attempts === 0) {
          log.push(">Lockout in", ">progress.");
          renderLog();
          endScreen(["TERMINAL LOCKED", "PLEASE CONTACT AN ADMINISTRATOR"], "pip:locked");
        }
      });

      renderStatus();
      renderLog();
    };

    el.pipReset = build;
    build();
  }

  /* Init ------------------------------------------------------------------ */

  function init(scope = document) {
    const all = (sel) => scope.querySelectorAll(sel);
    all("[data-pip-tabs]").forEach(initTabs);
    all("[data-pip-list]").forEach(initList);
    all(".pip-segmented[role=radiogroup]").forEach(initSegmented);
    all(".pip-toggle[role=switch]").forEach(initToggle);
    all("[data-pip-stepper]").forEach(initStepper);
    all("[data-pip-pager]").forEach(initPager);
    all(".pip-range").forEach(initRange);
    all(".pip-btn--hold").forEach(initHold);
    all(".pip-meter[aria-valuenow]").forEach((m) => setMeter(m));
    all("[data-pip-scope]").forEach(initScope);
    all("[data-pip-map]").forEach(initMap);
    all("[data-pip-compass]").forEach(initCompass);
    all("[data-pip-hack]").forEach(initHack);
    all("[data-pip-fx]").forEach((input) => {
      if (!once(input, "Fx")) return;
      input.checked = !root.classList.contains("pip-no-" + input.dataset.pipFx);
      input.addEventListener("change", () => setFx(input.dataset.pipFx, input.checked));
    });
    all("[data-pip-type]").forEach((el) => { if (once(el, "Type")) type(el); });
  }

  window.Pip = {
    TUBES,
    init,
    setPhosphor,
    setFx,
    setMeter,
    toast,
    confirm,
    type,
    power,
    likeness,
    compass: (el) => el.pipCompass,
    scope: (el) => el.pipScope,
    map: (el) => el.pipMap,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => init());
  else init();
})();
