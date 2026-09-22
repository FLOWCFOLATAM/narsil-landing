/* Narsil Protocol — Centro de mando (maqueta interactiva para inversores)
 *
 * Que es real y que es maqueta, para que nadie lo confunda:
 *   - El acceso es real: Amazon Cognito, flujo de codigo con PKCE. Ninguna
 *     contrasena pasa por este sitio. Las comprobaciones de la pantalla de
 *     acceso tambien son reales (latencia del sitio, descubrimiento OpenID de
 *     Cognito, carga de escenarios).
 *   - Los videos de Seguridad, Retail y Produccion son corridas reales del
 *     motor con su overlay ya pintado, y sus alertas, embudos y conteos salen
 *     de los escenarios exportados (app/data/*.json): los eventos que
 *     dispararon de verdad, en el instante en que ocurrieron.
 *   - Lo simulado esta marcado en pantalla (DEMO DATA, PROYECCION,
 *     SIMULACION): compras, ERP, la semana tipo del panel comercial y la
 *     mision de dron entera, incluido su POV (clips FPV libres de Pexels).
 */
(() => {
  "use strict";

  /* ============ CONFIGURACION DE ACCESO ============ */
  // Identificadores publicos de un cliente publico: no son secretos.
  const AUTH = {
    region: "us-east-1",
    poolId: "us-east-1_RwigCjM55",
    domain: "narsil-protocol-c8c094.auth.us-east-1.amazoncognito.com",
    clientId: "1h13ehjo696shqevvuo3hf0ff3",
    scope: "openid email profile",
  };
  // Cognito exige que redirect_uri coincida EXACTAMENTE con la registrada,
  // barra final incluida. Se calcula, no se escribe a mano.
  const REDIRECT = (() => {
    let p = location.pathname;
    if (!p.endsWith("/")) p = p.replace(/[^/]*$/, "");
    return location.origin + p;
  })();

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmt1 = (n) => n.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt0 = (n) => Math.round(n).toLocaleString("es-PE");
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  /* ============ PKCE ============ */
  const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const aleatorio = (n = 64) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a).slice(0, n); };
  const sha256 = async (s) => b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

  async function login() {
    const verifier = aleatorio(96), state = aleatorio(24);
    sessionStorage.setItem("pkce_verifier", verifier);
    sessionStorage.setItem("pkce_state", state);
    const q = new URLSearchParams({
      client_id: AUTH.clientId, response_type: "code", scope: AUTH.scope,
      redirect_uri: REDIRECT, state, code_challenge: await sha256(verifier), code_challenge_method: "S256",
    });
    location.assign(`https://${AUTH.domain}/oauth2/authorize?${q}`);
  }

  async function canjear(code, state) {
    if (state !== sessionStorage.getItem("pkce_state")) throw new Error("El estado de la sesión no coincide. Vuelve a entrar.");
    const body = new URLSearchParams({
      grant_type: "authorization_code", client_id: AUTH.clientId, code,
      redirect_uri: REDIRECT, code_verifier: sessionStorage.getItem("pkce_verifier") || "",
    });
    const r = await fetch(`https://${AUTH.domain}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!r.ok) throw new Error(`Cognito rechazó el canje (${r.status}).`);
    const t = await r.json();
    sessionStorage.setItem("sesion", JSON.stringify({ id: t.id_token, exp: Date.now() + (t.expires_in || 3600) * 1000 }));
    sessionStorage.removeItem("pkce_verifier"); sessionStorage.removeItem("pkce_state");
  }

  function sesion() {
    try {
      const s = JSON.parse(sessionStorage.getItem("sesion") || "null");
      if (!s || Date.now() > s.exp) return null;
      return JSON.parse(atob(s.id.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    } catch { return null; }
  }

  function logout() {
    sessionStorage.removeItem("sesion");
    const q = new URLSearchParams({ client_id: AUTH.clientId, logout_uri: REDIRECT });
    location.assign(`https://${AUTH.domain}/logout?${q}`);
  }

  /* play() falla en silencio sin datos, y el navegador pausa el video mudo al
     perder el foco. Se reintenta al tener datos y al recuperar el foco. */
  function reproducir(v) {
    if (!v) return;
    const p = v.play();
    if (p && p.catch) p.catch(() => { v.addEventListener("canplay", () => v.play().catch(() => {}), { once: true }); });
  }
  const reanudarActivo = () => {
    if (document.visibilityState !== "visible") return;
    $$(".view.is-active video, #gate-video, .drone video").forEach((v) => { if (v.src && v.paused && !v.closest("[hidden]")) reproducir(v); });
  };
  document.addEventListener("visibilitychange", reanudarActivo);
  window.addEventListener("focus", reanudarActivo);

  /* ============ PANTALLA DE ACCESO ============ */
  async function comprobaciones() {
    const li = (k) => $(`#gate-checks li[data-check="${k}"]`);
    const pon = (k, texto, clase, detalle) => { const el = li(k); el.classList.add("is-in"); el.querySelector("i").textContent = detalle; const b = el.querySelector(".badge"); b.textContent = texto; b.className = `badge ${clase}`; };
    await espera(250);
    try { const t0 = performance.now(); const r = await fetch("data/seguridad.json", { cache: "no-store" }); pon("enlace", r.ok ? "OK" : "ERR", r.ok ? "ok" : "err", `${Math.round(performance.now() - t0)} ms`); }
    catch { pon("enlace", "ERR", "err", "sin respuesta"); }
    await espera(320);
    try {
      const t0 = performance.now();
      const r = await fetch(`https://cognito-idp.${AUTH.region}.amazonaws.com/${AUTH.poolId}/.well-known/openid-configuration`, { cache: "no-store" });
      pon("cognito", r.ok ? "OK" : "ERR", r.ok ? "ok" : "err", r.ok ? `OpenID · ${Math.round(performance.now() - t0)} ms` : `HTTP ${r.status}`);
    } catch { pon("cognito", "—", "warn", "sin verificar desde el navegador"); }
    await espera(320);
    try { const r = await fetch("data/produccion.json", { cache: "no-store" }); const d = await r.json(); pon("motor", "OK", "ok", `${d.kpis?.entidades_unicas ?? "—"} u · escenarios cargados`); }
    catch { pon("motor", "ERR", "err", "escenarios no disponibles"); }
  }

  /* ============ ARRANQUE ============ */
  async function arrancar() {
    const gate = $("#gate"), app = $("#app"), err = $("#gate-err");
    $("#gate-foot").textContent = `redirect_uri · ${REDIRECT}`;
    $("#btn-login").addEventListener("click", () => login().catch((e) => { err.textContent = e.message; err.hidden = false; }));
    $("#btn-logout").addEventListener("click", logout);

    const u = new URL(location.href);
    if (u.searchParams.get("code")) {
      try { await canjear(u.searchParams.get("code"), u.searchParams.get("state")); history.replaceState({}, "", REDIRECT); }
      catch (e) { history.replaceState({}, "", REDIRECT); err.textContent = e.message; err.hidden = false; }
    } else if (u.searchParams.get("error")) {
      err.textContent = u.searchParams.get("error_description") || u.searchParams.get("error"); err.hidden = false;
      history.replaceState({}, "", REDIRECT);
    }

    const claims = sesion();
    if (!claims) { gate.hidden = false; app.hidden = true; reproducir($("#gate-video")); comprobaciones(); return; }
    gate.hidden = true; app.hidden = false;
    $("#rail-user").textContent = claims.email || claims["cognito:username"] || "sesión activa";
    iniciarApp();
  }

  /* ============ APLICACION ============ */
  const TITULOS = {
    seguridad: ["Seguridad", "Eventos y evidencia"],
    retail: ["Retail", "Tránsito y atención al local"],
    comercial: ["Retail · Plataforma comercial", "Tráfico, atención y conversión"],
    produccion: ["Producción", "Conteo y ritmo de línea"],
    flota: ["Flota y pre-vuelo", "Drones · planificación de misión"],
  };
  const REGLAS = { restricted_zone_intrusion: "Intrusión en zona restringida", loitering: "Merodeo", crowd_density: "Aglomeración", repeated_crossing: "Cruces repetidos" };
  const SEV = { high: "Alta", medium: "Media", low: "Baja" };
  const cargar = (p) => fetch(p, { cache: "no-store" }).then((r) => r.json());

  /* Cuenta de 0 al valor. SOLO para acumulados fijos: una tasa animada
     ensena un numero que no concuerda con el de al lado. */
  function tick(el, valor, ms = 700) {
    el.textContent = fmt0(valor);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t0 = performance.now();
    const paso = () => { const p = Math.min(1, (performance.now() - t0) / ms); el.textContent = fmt0(valor * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(paso); else el.textContent = fmt0(valor); };
    requestAnimationFrame(paso);
  }

  function iniciarApp() {
    reloj();
    pestanas();
    reproducir($("#seg-video"));
    cargar("data/seguridad.json").then(seguridad);
    cargar("data/rosen.json").then((d) => { retail(d); comercial(d); });
    cargar("data/produccion.json").then(produccion);
    flota();
  }

  function reloj() {
    const el = $("#top-clock");
    const t = () => { el.textContent = new Date().toLocaleTimeString("es-PE", { hour12: false }); };
    t(); setInterval(t, 1000);
  }

  function activar(id) {
    const tabId = id === "comercial" ? "retail" : id;
    $$(".tab").forEach((x) => x.classList.toggle("is-active", x.dataset.tab === tabId));
    $$(".view").forEach((v) => {
      const activa = v.dataset.view === id;
      if (activa) { v.classList.remove("is-active"); void v.offsetWidth; }   // reinicia la animacion de entrada
      v.classList.toggle("is-active", activa);
      // Un solo video reproduciendose: dos a la vez compiten por decodificador.
      $$("video", v).forEach((vid) => { if (activa && vid.src && !vid.closest("[hidden]")) reproducir(vid); else vid.pause(); });
    });
    $("#top-label").textContent = TITULOS[id][0]; $("#top-title").textContent = TITULOS[id][1];
    if (id === "flota") $$(".drone video").forEach((v) => { if (!v.src) v.src = v.dataset.src; reproducir(v); });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function pestanas() { $$(".tab").forEach((b) => b.addEventListener("click", () => activar(b.dataset.tab))); }

  /* Sincroniza un video con sus paneles: fn(t) en cada fotograma pintado,
     fn(-1) cuando el bucle vuelve a empezar. */
  function seguir(video, barra, tEl, fn) {
    let ultimo = -1;
    const paso = () => {
      const t = video.currentTime || 0;
      if (t < ultimo - 0.5) fn(-1);
      ultimo = t;
      const d = video.duration || 1;
      if (barra) barra.style.width = `${Math.min(100, (t / d) * 100)}%`;
      if (tEl) tEl.textContent = `t = ${fmt1(t)} s`;
      fn(t);
      requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
    // Respaldo: si el navegador retrasa rAF, timeupdate (~4 Hz) sigue moviendo los paneles.
    video.addEventListener("timeupdate", () => { const t = video.currentTime || 0; if (t < ultimo - 0.5) fn(-1); ultimo = t; fn(t); });
  }
  function marcas(timeline, eventos, dur, clase = "") {
    eventos.forEach((e) => { const m = document.createElement("i"); m.className = `timeline__mark ${clase}`; m.style.left = `${Math.max(0, Math.min(100, (e.t / dur) * 100))}%`; timeline.appendChild(m); });
  }
  const hastaT = (serie, t, idx = 1) => { let v = 0; for (const p of serie) { if (p[0] <= t) v = p[idx]; else break; } return v; };

  /* ---------- SEGURIDAD ---------- */
  function seguridad(d) {
    // El clip publicado es el tramo 4-18 s de la corrida: se desplazan los
    // tiempos y se descartan los eventos que caen fuera.
    const INI = 4, FIN = 18;
    const ev = d.eventos.filter((e) => (e.t_fin ?? e.t) >= INI && e.t <= FIN)
      .map((e) => ({ ...e, t: Math.max(0, e.t - INI), t_fin: Math.min(FIN, e.t_fin ?? e.t) - INI })).sort((a, b) => a.t - b.t);
    tick($("#seg-personas"), d.kpis.entidades_unicas ?? 0);
    tick($("#seg-eventos"), ev.length);
    const porRegla = {};
    ev.forEach((e) => { (porRegla[e.regla] ||= new Set()).add(e.zona); });
    Object.entries(porRegla).forEach(([r, zonas]) => { const li = document.createElement("li"); li.innerHTML = `${REGLAS[r] || r} <i>· ${[...zonas].join(", ")} · solo personas · excepto cruce</i>`; $("#seg-reglas").appendChild(li); });

    const video = $("#seg-video"), lista = $("#seg-alertas"), vacio = $("#seg-vacio");
    marcas($("#seg-timeline"), ev, FIN - INI);
    const atendidas = new Set();
    let filtro = "todas", sel = null, mostrados = new Set();
    const pinta = (e) => {
      const li = document.createElement("li");
      li.className = `alert alert--${e.severidad}${atendidas.has(e.uid) ? " is-atendida" : ""}`;
      li.dataset.uid = e.uid; li.dataset.sev = e.severidad;
      li.innerHTML = `<span class="alert__t">${fmt1(e.t)} s</span><span><span class="alert__regla">${SEV[e.severidad] || e.severidad} · ${REGLAS[e.regla] || e.regla}</span><span class="alert__texto">${e.texto}</span></span><span class="alert__zona">${e.zona}</span>`;
      li.addEventListener("click", () => detalle(e, li));
      li.hidden = !(filtro === "todas" || filtro === e.severidad);
      lista.prepend(li); vacio.hidden = true;
    };
    const detalle = (e, li) => {
      sel = e;
      $$(".alert", lista).forEach((x) => x.classList.toggle("is-sel", x === li));
      $("#seg-detalle").hidden = false;
      $("#det-sev").textContent = `${SEV[e.severidad] || e.severidad} · ${REGLAS[e.regla] || e.regla}`;
      $("#det-sev").style.color = e.severidad === "high" ? "var(--alerta)" : e.severidad === "medium" ? "var(--warn)" : "var(--ok)";
      $("#det-texto").textContent = e.texto; $("#det-zona").textContent = e.zona;
      $("#det-t").textContent = `${fmt1(e.t)} s`; $("#det-dur").textContent = `${fmt1(Math.max(0, e.t_fin - e.t))} s`;
      $("#det-ent").textContent = (e.entidades || []).map((n) => `#${n}`).join(", ") || "—";
      $("#det-atender").textContent = atendidas.has(e.uid) ? "Reabrir" : "Marcar atendida";
    };
    $("#seg-cerrar").addEventListener("click", () => { $("#seg-detalle").hidden = true; $$(".alert", lista).forEach((x) => x.classList.remove("is-sel")); });
    $("#det-ver").addEventListener("click", () => { if (!sel) return; video.currentTime = Math.max(0, sel.t - 0.2); reproducir(video); });
    $("#det-atender").addEventListener("click", () => {
      if (!sel) return;
      atendidas.has(sel.uid) ? atendidas.delete(sel.uid) : atendidas.add(sel.uid);
      const li = $(`.alert[data-uid="${sel.uid}"]`, lista); if (li) li.classList.toggle("is-atendida", atendidas.has(sel.uid));
      $("#det-atender").textContent = atendidas.has(sel.uid) ? "Reabrir" : "Marcar atendida";
      abiertas(video.currentTime);
    });
    $$("#seg-filtros .chip").forEach((c) => c.addEventListener("click", () => {
      filtro = c.dataset.sev;
      $$("#seg-filtros .chip").forEach((x) => x.classList.toggle("is-active", x === c));
      $$(".alert", lista).forEach((x) => { x.hidden = !(filtro === "todas" || filtro === x.dataset.sev); });
    }));
    const abiertas = (t) => { $("#seg-abiertas").textContent = ev.filter((e) => e.t <= t && t <= e.t_fin + 0.3 && !atendidas.has(e.uid)).length; };
    seguir(video, $("#seg-bar"), $("#seg-t"), (t) => {
      if (t < 0) { lista.innerHTML = ""; mostrados = new Set(); vacio.hidden = false; return; }
      ev.forEach((e) => { if (e.t <= t && !mostrados.has(e.uid)) { mostrados.add(e.uid); pinta(e); } });
      abiertas(t);
    });
  }

  /* ---------- RETAIL (Rosen) ---------- */
  function retail(d) {
    const video = $("#ret-video"), dur = d.duracion || 18;
    const ev = d.eventos.slice().sort((a, b) => a.t - b.t);
    marcas($("#ret-timeline"), ev, dur, "timeline__mark--ok");
    const conteo = d.series.conteo || [], ocup = d.series.ocupacion || [];
    const dirs = d.kpis.por_direccion || {}, totalDir = Object.values(dirs).reduce((a, b) => a + b, 0) || 1;
    const ETIQ = { "izq->der": "Izquierda → derecha", "der->izq": "Derecha → izquierda", "sin rumbo claro": "Sin rumbo claro" };
    const barras = (cont) => Object.entries(dirs).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => { const row = document.createElement("div"); row.className = "bar"; row.innerHTML = `<span>${ETIQ[k] || k}</span><i><b style="--w:${(v / totalDir) * 100}%"></b></i><em>${v}</em>`; cont.appendChild(row); });
    barras($("#ret-dir")); barras($("#com-dir"));
    $("#btn-comercial").addEventListener("click", () => activar("comercial"));
    $("#com-volver").addEventListener("click", () => activar("retail"));

    const lista = $("#ret-eventos");
    let mostrados = new Set();
    const canvas = $("#ret-spark"), ctx = canvas.getContext("2d");
    const puntos = ocup.map(([t, z]) => [t, z.pasillo ?? Math.max(0, ...Object.values(z))]);
    const maxO = Math.max(1, ...puntos.map((p) => p[1]));
    const spark = (t) => {
      const W = canvas.width, H = canvas.height; ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(244,247,251,0.14)"; ctx.beginPath(); ctx.moveTo(0, H - 14); ctx.lineTo(W, H - 14); ctx.stroke();
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "rgba(134,197,255,0.35)"); g.addColorStop(1, "rgba(134,197,255,0)");
      ctx.beginPath(); puntos.forEach(([tt, v], i) => { const x = (tt / dur) * W, y = H - 14 - (v / maxO) * (H - 28); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.lineTo((puntos.at(-1)?.[0] / dur) * W, H - 14); ctx.lineTo(0, H - 14); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.strokeStyle = "#86C5FF"; ctx.lineWidth = 2; puntos.forEach(([tt, v], i) => { const x = (tt / dur) * W, y = H - 14 - (v / maxO) * (H - 28); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      const x = (t / dur) * W; ctx.strokeStyle = "#176BFF"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, H - 14); ctx.stroke();
      ctx.fillStyle = "rgba(244,247,251,0.5)"; ctx.font = "11px IBM Plex Mono"; ctx.fillText(`máx ${maxO}`, 6, 14);
    };
    seguir(video, $("#ret-bar"), $("#ret-t"), (t) => {
      if (t < 0) { lista.innerHTML = ""; mostrados = new Set(); return; }
      const pasaron = hastaT(conteo, t);
      const detEv = ev.filter((e) => e.t <= t);
      // De los que pasaron, cuantos se detuvieron: el segundo escalon nunca supera al primero.
      const detenidos = Math.min(pasaron, new Set(detEv.flatMap((e) => e.entidades || [])).size);
      const compras = Math.round(detenidos * 0.635);
      $("#ret-pasaron").textContent = pasaron; $("#ret-detenidos").textContent = detenidos; $("#ret-compras").textContent = compras;
      $("#ret-detbar").style.setProperty("--w", `${pasaron ? (detenidos / pasaron) * 100 : 0}%`);
      $("#ret-combar").style.setProperty("--w", `${pasaron ? (compras / pasaron) * 100 : 0}%`);
      const tasa = pasaron ? (detenidos / pasaron) * 100 : null;
      $("#ret-atencion").textContent = tasa === null ? "—" : `${fmt1(tasa)} %`;
      $("#ret-tasa").textContent = tasa === null ? "— se detienen a mirar" : `↓ ${fmt1(tasa)} % se detienen a mirar`;
      $("#ret-ahora").textContent = hastaT(puntos, t);
      detEv.forEach((e) => {
        if (mostrados.has(e.uid)) return; mostrados.add(e.uid);
        const li = document.createElement("li"); li.className = "alert alert--low";
        li.innerHTML = `<span class="alert__t">${fmt1(e.t)} s</span><span><span class="alert__regla">Interés · ${REGLAS[e.regla] || e.regla}</span><span class="alert__texto">${e.texto}</span></span><span class="alert__zona">${e.zona}</span>`;
        lista.prepend(li);
      });
      spark(t);
    });
  }

  /* ---------- PLATAFORMA COMERCIAL ---------- */
  function comercial(d) {
    const dur = d.duracion || 18, pasadas = d.kpis.entidades_unicas || 0;
    const ev = d.eventos.slice().sort((a, b) => a.t - b.t);
    const detenidos = Math.min(pasadas, new Set(ev.flatMap((e) => e.entidades || [])).size);
    const tasa = pasadas ? (detenidos / pasadas) * 100 : null;
    const compras = Math.round(detenidos * 0.635);
    const porHora = Math.round((pasadas / dur) * 3600);
    tick($("#com-trafico"), pasadas);
    $("#com-hora").textContent = fmt0(porHora);
    $("#com-atencion").textContent = tasa === null ? "—" : `${fmt1(tasa)} %`;
    $("#com-detenidos").textContent = `${detenidos} de ${pasadas} se detuvieron frente al local`;
    $("#com-compras").textContent = compras;
    $("#com-n").textContent = `${ev.length} en ${fmt1(dur)} s`;

    // Semana tipo y curva horaria: PROYECCION declarada a partir del ritmo
    // medido. Los factores son de forma, no de medida, y van marcados.
    const DIAS = ["L", "M", "X", "J", "V", "S", "D"], FD = [0.86, 0.9, 0.94, 1.0, 1.18, 1.34, 1.22];
    const FH = [0.35, 0.5, 0.7, 0.95, 1.0, 0.8, 0.7, 0.85, 1.0, 0.9, 0.6, 0.4];
    const semana = FD.map((f) => Math.round(porHora * 12 * f * 0.55));
    const c = $("#com-semana"), ctx = c.getContext("2d"), W = c.width, H = c.height, maxS = Math.max(...semana);
    ctx.clearRect(0, 0, W, H);
    const bw = W / 7 * 0.56;
    semana.forEach((v, i) => {
      const x = (i + 0.5) * (W / 7) - bw / 2, h = (v / maxS) * (H - 44);
      const g = ctx.createLinearGradient(0, H - 24 - h, 0, H - 24); g.addColorStop(0, "#176BFF"); g.addColorStop(1, "rgba(23,107,255,0.25)");
      ctx.fillStyle = g; ctx.fillRect(x, H - 24 - h, bw, h);
      ctx.fillStyle = "rgba(244,247,251,0.55)"; ctx.font = "11px IBM Plex Mono"; ctx.textAlign = "center";
      ctx.fillText(DIAS[i], x + bw / 2, H - 8); ctx.fillText(fmt0(v), x + bw / 2, H - 30 - h);
    });
    const heat = $("#com-horas"); heat.innerHTML = "";
    FH.forEach((f, i) => { const div = document.createElement("div"); div.style.setProperty("--v", f); div.innerHTML = `<span>${10 + i}h</span>`; div.title = `${10 + i}:00 · ${fmt0(porHora * f)} / h`; heat.appendChild(div); });
    const tb = $("#com-tabla"); tb.innerHTML = "";
    ev.forEach((e, i) => { const tr = document.createElement("tr"); tr.innerHTML = `<td class="mono">${String(i + 1).padStart(2, "0")}</td><td class="mono">${fmt1(e.t)} s → ${fmt1(e.t_fin ?? e.t)} s</td><td class="mono">${e.zona}</td><td class="mono">${(e.entidades || []).map((n) => "#" + n).join(", ")}</td><td>${e.texto}</td>`; tb.appendChild(tr); });

    // Excel real (SheetJS, Apache-2.0) cargado solo cuando alguien lo pide.
    const estado = $("#com-estado");
    const filas = {
      Resumen: [["Métrica", "Valor", "Origen"],
        ["Pasadas medidas", pasadas, "motor · corrida real"], ["Duración medida (s)", dur, "motor · corrida real"],
        ["Se detuvieron frente al local", detenidos, "motor · eventos de merodeo"], ["Tasa de atención (%)", tasa === null ? "" : +tasa.toFixed(1), "calculado"],
        ["Tráfico por hora (proyección)", porHora, "PROYECCIÓN"], ["Compras estimadas", compras, "DEMO DATA · tasa POS 63,5 %"]],
      Eventos: [["#", "t (s)", "t_fin (s)", "Regla", "Severidad", "Zona", "Personas", "Texto"], ...ev.map((e, i) => [i + 1, e.t, e.t_fin ?? "", e.regla, e.severidad, e.zona, (e.entidades || []).join(" "), e.texto])],
      Ocupacion: [["t (s)", ...Object.keys((d.series.ocupacion?.[0] || [0, {}])[1])], ...(d.series.ocupacion || []).map(([t, z]) => [t, ...Object.values(z)])],
      Conteo: [["t (s)", "Pasadas acumuladas"], ...(d.series.conteo || [])],
      Semana_proyeccion: [["Día", "Pasadas (PROYECCIÓN)"], ...DIAS.map((x, i) => [x, semana[i]])],
    };
    const csv = () => {
      const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
      const blob = new Blob(["﻿" + filas.Eventos.map((r) => r.map(esc).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "narsil-rosen-eventos.csv"; a.click(); URL.revokeObjectURL(a.href);
    };
    $("#com-xlsx").addEventListener("click", async () => {
      estado.textContent = "Preparando el libro…";
      try {
        if (!window.XLSX) await new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
        const wb = XLSX.utils.book_new();
        Object.entries(filas).forEach(([n, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n));
        XLSX.writeFile(wb, "narsil-rosen-comercial.xlsx");
        estado.textContent = `Descargado narsil-rosen-comercial.xlsx · ${Object.keys(filas).length} hojas`;
      } catch { csv(); estado.textContent = "No se pudo cargar el generador de Excel; se descargó CSV."; }
    });
  }

  /* ---------- PRODUCCION ---------- */
  function produccion(d) {
    const video = $("#pro-video"), dur = d.duracion || 12.28, conteo = d.series.conteo || [];
    const total = d.kpis.entidades_unicas || (conteo.length ? conteo.at(-1)[1] : 0);
    const canvas = $("#pro-spark"), ctx = canvas.getContext("2d");
    const deltas = conteo.map(([t, v], i) => [t, i ? v - conteo[i - 1][1] : v]);
    const maxD = Math.max(1, ...deltas.map((p) => p[1]));
    const spark = (t) => {
      const W = canvas.width, H = canvas.height; ctx.clearRect(0, 0, W, H);
      const bw = Math.max(2, W / Math.max(1, dur) - 3);
      deltas.forEach(([tt, v]) => { const x = (tt / dur) * W, h = (v / maxD) * (H - 28); ctx.fillStyle = tt <= t ? "#176BFF" : "rgba(244,247,251,0.12)"; ctx.fillRect(x, H - 14 - h, bw, h); });
      ctx.fillStyle = "rgba(244,247,251,0.5)"; ctx.font = "11px IBM Plex Mono"; ctx.fillText(`máx ${maxD} u/s`, 6, 14);
    };
    seguir(video, $("#pro-bar"), $("#pro-t"), (t) => {
      if (t < 0) return;
      const u = Math.min(total, hastaT(conteo, t) + (t >= dur - 0.4 ? total - hastaT(conteo, dur) : 0));
      $("#pro-unidades").textContent = u;
      const ritmo = t >= 3 ? (u / t) * 60 : null;      // sin denominador no hay tasa
      $("#pro-ritmo").textContent = ritmo === null ? "—" : fmt0(ritmo);
      $("#pro-turno").textContent = ritmo === null ? "—" : fmt0(ritmo * 60 * 8);
      spark(t);
    });
  }

  /* ---------- FLOTA Y PRE-VUELO ---------- */
  // Clips FPV libres (Pexels): el POV del vuelo. Despegue y aterrizaje se
  // construyen con tratamiento de camara sobre el mismo POV.
  const POV = {
    bosque: "https://videos.pexels.com/video-files/38466494/16335780_2560_1440_60fps.mp4",   // despegue, retorno, aterrizaje
    vuelo: "https://videos.pexels.com/video-files/35837649/15196317_2560_1440_50fps.mp4",    // crucero (Sintra, elegido por Hugo)
  };
  const DRONES = [
    { id: "sentinel", nombre: "Narsil Sentinel", tipo: "Quadcopter de vigilancia y percepción",
      video: "https://videos.pexels.com/video-files/34709265/14711662_2560_1440_30fps.mp4",
      autonomia: [15, 20], vel: [30, 50], carga: [0.3, 0.6], lidar: { modelo: "Garmin LiDAR-Lite v4", alcance: 10 },
      specs: { Sensores: "RGB 12 MP · LiDAR · GPS M10", Navegación: "ArduPilot · MAVLink", Estructura: "F450 · 450 mm · 4 × 920 KV", Batería: "LiPo 5000 mAh", Cómputo: "Raspberry Pi 5 · 4 GB", Presupuesto: "S/ 2.500" },
      usos: ["Perímetros", "Seguridad municipal", "Obras", "Infraestructura", "Rescate cercano", "Tráfico"],
      estado: { bat: 96, gps: 14, link: 88, horas: 12.4 }, vtol: false },
    { id: "ranger", nombre: "Narsil Ranger VTOL", tipo: "Tiltrotor de vigilancia y cobertura extendida",
      video: "https://videos.pexels.com/video-files/7132177/7132177-uhd_2560_1440_24fps.mp4",
      autonomia: [45, 60], vel: [60, 85], carga: [0.5, 1.0], lidar: { modelo: "Garmin LiDAR-Lite v3", alcance: 40 },
      specs: { Sensores: "RGB 12 MP · LiDAR · GPS M10", Navegación: "ArduPilot · MAVLink", Estructura: "Envergadura 1,8–2,0 m · 4 rotores basculantes", Batería: "LiPo 6S", Cómputo: "Raspberry Pi 5", Presupuesto: "S/ 3.500" },
      usos: ["Fronteras", "Patrullaje rural", "Corredores", "Infraestructura crítica", "Ambiental", "Búsqueda y rescate"],
      estado: { bat: 88, gps: 16, link: 94, horas: 31.2 }, vtol: true },
  ];

  function flota() {
    const cards = $("#fleet-cards"), sel = $("#pf-dron");
    DRONES.forEach((d, i) => {
      const card = document.createElement("article");
      card.className = `drone${i === 0 ? " is-sel" : ""}`; card.dataset.id = d.id;
      card.innerHTML = `<div class="drone__media"><video muted loop playsinline preload="none" data-src="${d.video}"></video>
          <div class="drone__status"><span class="ok">LISTO</span><span>GPS ${d.estado.gps} SAT</span><span>${fmt1(d.estado.horas)} h</span></div>
          <div class="sys"><div>BATERÍA ${d.estado.bat} %<i><b style="--w:${d.estado.bat}%"></b></i></div><div>ENLACE ${d.estado.link} %<i><b style="--w:${d.estado.link}%"></b></i></div><div>GPS ${Math.round(d.estado.gps / 20 * 100)} %<i><b style="--w:${Math.round(d.estado.gps / 20 * 100)}%"></b></i></div></div></div>
        <div class="drone__body"><h2 class="drone__name">${d.nombre}</h2><p class="drone__type">${d.tipo}</p>
          <ul class="specs">
            <li><span>Autonomía</span><b>${d.autonomia[0]}–${d.autonomia[1]} min</b></li>
            <li><span>Crucero</span><b>${d.vel[0]}–${d.vel[1]} km/h</b></li>
            <li><span>Carga útil</span><b>${fmt1(d.carga[0])}–${fmt1(d.carga[1])} kg</b></li>
            ${Object.entries(d.specs).map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join("")}
          </ul>
          <div class="drone__usos">${d.usos.map((u) => `<span>${u}</span>`).join("")}</div></div>`;
      card.addEventListener("click", () => { sel.value = d.id; sel.dispatchEvent(new Event("change")); });
      cards.appendChild(card);
      const o = document.createElement("option"); o.value = d.id; o.textContent = d.nombre; sel.appendChild(o);
    });

    const f = { dron: sel, modo: $("#pf-modo"), dist: $("#pf-dist"), alt: $("#pf-alt"), vel: $("#pf-vel"), carga: $("#pf-carga"), lidar: $("#pf-lidar"), wp: $("#pf-wp"), checks: $$("[data-chk]"), btn: $("#pf-autorizar") };
    const dron = () => DRONES.find((d) => d.id === f.dron.value) || DRONES[0];
    const calcular = () => {
      const d = dron();
      $$(".drone").forEach((c) => c.classList.toggle("is-sel", c.dataset.id === d.id));
      $("#pf-dron-nombre").textContent = d.nombre;
      f.vel.min = d.vel[0]; f.vel.max = d.vel[1];
      let vel = Math.min(Math.max(+f.vel.value, d.vel[0]), d.vel[1]);
      const alt = +f.alt.value, dist = +f.dist.value, carga = +f.carga.value, wp = +f.wp.value, lidar = f.lidar.checked;
      const nota = [];
      if (lidar && alt < 40) { const tope = Math.round(d.vel[0] + (d.vel[1] - d.vel[0]) * 0.6); if (vel > tope) { vel = tope; nota.push(`Velocidad limitada a ${tope} km/h: a ${alt} m con LiDAR activo.`); } }
      f.vel.value = vel;
      $("#pf-dist-v").textContent = `${fmt1(dist)} km`; $("#pf-alt-v").textContent = `${alt} m`; $("#pf-vel-v").textContent = `${vel} km/h`; $("#pf-carga-v").textContent = `${fmt1(carga)} kg`; $("#pf-wp-v").textContent = wp;
      // Crucero + 0,4 min por waypoint + 2 min de despegue y aterrizaje. Autonomia:
      // el limite bajo de la ficha. Carga > 70 % de la maxima resta 15 %.
      const durMin = (dist / vel) * 60 + wp * 0.4 + 2;
      let auto = d.autonomia[0];
      if (carga > d.carga[1] * 0.7) { auto *= 0.85; nota.push("Carga alta: autonomía reducida un 15 %."); }
      const reserva = auto - durMin, consumo = (durMin / auto) * 100, swath = alt * 1.15 / 1000;
      const cob = f.modo.value === "corredor" ? `${fmt1(dist)} km de corredor` : `${fmt1(dist * swath)} km²`;
      $("#pl-dur").textContent = `${fmt0(durMin)} min`; $("#pl-auto").textContent = `${fmt0(auto)} min`;
      $("#pl-res").textContent = `${reserva >= 0 ? fmt0(reserva) : "−" + fmt0(-reserva)} min`;
      $("#pl-bat").textContent = `${fmt0(Math.min(999, consumo))} %`; $("#pl-cob").textContent = cob;
      $("#pl-lidar").textContent = lidar ? `${d.lidar.alcance} m · ${d.lidar.modelo}` : "desactivado";
      let v = "ok", txt = "Viable · margen suficiente";
      if (carga > d.carga[1]) { v = "no"; txt = `No viable · carga supera ${fmt1(d.carga[1])} kg`; nota.push("Reduce la carga útil o cambia de aeronave."); }
      else if (reserva < auto * 0.10) { v = "no"; txt = "No viable · sin reserva de aterrizaje"; nota.push("Acorta la misión o sube la velocidad de crucero."); }
      else if (reserva < auto * 0.25) { v = "ajustado"; txt = "Ajustado · reserva por debajo del 25 %"; }
      if (!lidar && alt < 40) nota.push("Sin LiDAR por debajo de 40 m no hay evitación de obstáculos.");
      const ver = $("#pl-veredicto"); ver.className = `plan__veredicto mono ${v}`; ver.textContent = txt;
      $("#pl-nota").textContent = nota.join(" ");
      const hechos = f.checks.filter((c) => c.checked).length, listo = hechos === f.checks.length;
      f.btn.disabled = !(listo && v !== "no");
      f.btn.textContent = !listo ? `Completa la lista (${hechos}/${f.checks.length})` : v === "no" ? "Plan no viable" : "Autorizar y simular vuelo";
      return { d, durMin, auto, consumo, dist, alt, vel, wp, lidar, modo: f.modo.value };
    };
    [f.dron, f.modo, f.dist, f.alt, f.vel, f.carga, f.lidar, f.wp, ...f.checks].forEach((el) => el.addEventListener("input", calcular));
    f.dron.addEventListener("change", calcular);
    calcular();
    f.btn.addEventListener("click", () => simular(calcular()));
  }

  /* Ruta en el mini-mapa: perimetro cerrado, corredor, patrulla o ida y
     vuelta a un punto. Determinista a partir del numero de waypoints. */
  function ruta(modo, n) {
    const pts = [];
    if (modo === "corredor") { for (let i = 0; i < n; i++) { const x = 14 + (172 * i) / (n - 1); pts.push([x, 65 + Math.sin(i * 1.3) * 22]); } }
    else if (modo === "respuesta") { pts.push([18, 112]); for (let i = 1; i < n - 1; i++) { const p = i / (n - 1); pts.push([18 + 160 * p, 112 - 90 * p + Math.sin(i * 2.1) * 8]); } pts.push([178, 22]); }
    else { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const r = 42 + Math.sin(i * 2.7) * 10; pts.push([100 + Math.cos(a) * r * 1.9, 65 + Math.sin(a) * r]); } pts.push(pts[0].slice()); }
    return pts;
  }

  function simular({ d, durMin, auto, consumo, dist, alt, vel, wp, lidar, modo }) {
    const m = $("#mision"); m.hidden = false; m.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const feed = $("#mi-feed"), vA = $("#mi-vA"), vB = $("#mi-vB"), log = $("#mi-log"), fases = $$("#mi-fases li");
    if (!vA.src) vA.src = POV.bosque; if (!vB.src) vB.src = POV.vuelo;
    reproducir(vA); reproducir(vB);
    fases[1].textContent = d.vtol ? "Transición" : "Ascenso";
    log.innerHTML = "";
    const linea = (txt, clase = "", badge = "") => { const div = document.createElement("div"); if (clase) div.className = clase; div.innerHTML = `<i>${new Date().toLocaleTimeString("es-PE", { hour12: false })}</i><em>${txt}</em>${badge ? `<span class="badge ${badge.split(":")[1] || "ok"}">${badge.split(":")[0]}</span>` : "<span></span>"}`; log.appendChild(div); log.scrollTop = log.scrollHeight; };

    // Mini-mapa
    const pts = ruta(modo, Math.max(3, Math.min(wp, 24)));
    const dpath = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    const grid = $("#mi-ruta-grid"); grid.innerHTML = "";
    for (let x = 0; x <= 200; x += 25) grid.insertAdjacentHTML("beforeend", `<line x1="${x}" y1="0" x2="${x}" y2="130"/>`);
    for (let y = 0; y <= 130; y += 26) grid.insertAdjacentHTML("beforeend", `<line x1="0" y1="${y}" x2="200" y2="${y}"/>`);
    $("#mi-ruta-path").setAttribute("d", dpath); $("#mi-ruta-hecho").setAttribute("d", dpath);
    $("#mi-ruta-wps").innerHTML = pts.slice(0, -1).map((p) => `<circle class="wp" cx="${p[0]}" cy="${p[1]}" r="1.6"/>`).join("");
    $("#mi-ruta-n").textContent = wp;
    const hecho = $("#mi-ruta-hecho"), L = hecho.getTotalLength(); hecho.style.strokeDasharray = L; hecho.style.strokeDashoffset = L;
    const dot = $("#mi-ruta-dot");
    const ticker = $("#mi-ticker");
    const tk = (bat, sat, lat) => { const s = `MAVLink <b>${lat} ms</b> GPS <b>${sat} SAT · HDOP 0,8</b> LIDAR <b>${lidar ? d.lidar.alcance + " m" : "OFF"}</b> BAT <b>${bat} %</b> GEOCERCA <b>ACTIVA</b> AUTOPILOTO <b>ArduPilot ${d.vtol ? "QPLANE" : "COPTER"}</b> MODO <b>${modo.toUpperCase()}</b> ALT OBJ <b>${alt} m</b> `; ticker.innerHTML = s + s; };
    tk(100, d.estado.gps, 42);

    // Fases (segundos de reloj) precedidas por las comprobaciones de sistemas.
    const plan = [["Despegue", 2.4], [d.vtol ? "Transición" : "Ascenso", 1.8], ["Crucero", 7.6], ["Retorno", 2.4], ["Aterrizaje", 2.4]];
    const total = plan.reduce((a, p) => a + p[1], 0);
    const checks = [
      [`Enlace MAVLink · ${d.nombre}`, "OK 42 ms:ok"], ["Telemetría y video · canal 5,8 GHz", "OK:ok"],
      [`GPS · ${d.estado.gps} satélites · HDOP 0,8 · RTK flotante`, "OK:ok"], ["IMU y compás · calibración válida", "OK:ok"],
      ["Barómetro · QNH ajustado", "OK:ok"], [lidar ? `${d.lidar.modelo} · alcance ${d.lidar.alcance} m` : "LiDAR desactivado por el plan", lidar ? "OK:ok" : "OFF:warn"],
      [`Celdas · ${d.specs.Batería} · ${d.estado.bat} %`, d.estado.bat >= 95 ? "OK:ok" : "AVISO:warn"], [`Geocerca cargada · ${wp} waypoints · ${fmt1(dist)} km`, "OK:ok"],
      [`Plan aceptado · ${fmt0(durMin)} min · reserva ${fmt0(auto - durMin)} min · consumo ${fmt0(consumo)} %`, "OK:ok"], ["Motores armados · esperando autorización", "ARMADO:info"],
    ];
    $("#mi-fase").textContent = "PRE-VUELO"; $("#mi-sat").textContent = d.estado.gps; $("#mi-link").textContent = "OK";
    feed.className = "mission__feed"; vA.classList.add("is-on"); vB.classList.remove("is-on");
    let i = 0;
    const siguiente = () => { if (i < checks.length) { linea(checks[i][0], "", checks[i][1]); i++; setTimeout(siguiente, 430); } else vuelo(); };
    setTimeout(siguiente, 300);

    function vuelo() {
      const t0 = performance.now(); let faseAnt = -1, ultTelem = -2, wpAnt = -1, hdgBase = 60 + Math.random() * 200;
      linea("Autorización recibida · secuencia de despegue", "", "GO:info");
      const paso = () => {
        const s = (performance.now() - t0) / 1000, p = Math.min(1, s / total);
        let acc = 0, fase = plan.length - 1, pf = 0;
        for (let k = 0; k < plan.length; k++) { if (s < acc + plan[k][1]) { fase = k; pf = (s - acc) / plan[k][1]; break; } acc += plan[k][1]; }
        if (fase !== faseAnt) {
          faseAnt = fase;
          fases.forEach((li, k) => { li.classList.toggle("is-done", k < fase); li.classList.toggle("is-now", k === fase); });
          $("#mi-fase").textContent = plan[fase][0].toUpperCase();
          linea(`Fase: ${plan[fase][0]}`, "", "FASE:info");
          feed.className = `mission__feed ${fase === 0 ? "fase-despegue" : fase === 4 ? "fase-aterrizaje" : ""}`;
          const usaB = fase === 2; vA.classList.toggle("is-on", !usaB); vB.classList.toggle("is-on", usaB);
          $("#mi-cam").textContent = fase === 2 ? "CÁMARA FRONTAL · CRUCERO" : fase === 4 ? "CÁMARA INFERIOR · ATERRIZAJE" : "CÁMARA FRONTAL";
          if (fase === 1 && d.vtol) linea("Rotores basculando 90° · paso a sustentación por ala", "", "VTOL:info");
          if (fase === 3) linea("Punto de retorno alcanzado · rumbo a base", "", "RTL:info");
        }
        const perfil = fase === 0 ? Math.min(1, pf) : fase === 4 ? Math.max(0, 1 - pf) : 1;
        const altAct = alt * perfil, velAct = vel * (fase === 2 ? 1 : fase === 1 || fase === 3 ? 0.62 : 0.12 + 0.25 * perfil);
        const batAct = 100 - consumo * p, distAct = dist * Math.min(1, Math.max(0, (s - plan[0][1] - plan[1][1]) / (plan[2][1] + plan[3][1])));
        const hdg = (hdgBase + (fase >= 2 ? Math.sin(s * 0.7) * 18 + (fase === 3 ? 180 : 0) : 0) + 360) % 360;
        $("#mi-alt").textContent = fmt0(altAct); $("#mi-vel").textContent = fmt0(velAct); $("#mi-bat").textContent = fmt0(batAct);
        $("#mi-dist").textContent = fmt1(distAct); $("#mi-hdg").textContent = String(Math.round(hdg)).padStart(3, "0"); $("#mi-reloj").textContent = mmss(s);
        $("#mi-horizonte").style.setProperty("--roll", `${(fase === 1 || fase === 2 || fase === 3 ? Math.sin(s * 0.9) * 4 : 0).toFixed(1)}deg`);
        $("#mi-bar").style.width = `${p * 100}%`;
        // Ruta: el crucero y el retorno recorren la traza.
        const pr = Math.min(1, Math.max(0, (s - plan[0][1] - plan[1][1]) / (plan[2][1] + plan[3][1])));
        hecho.style.strokeDashoffset = L * (1 - pr);
        const pt = hecho.getPointAtLength(L * pr); dot.setAttribute("cx", pt.x); dot.setAttribute("cy", pt.y);
        const wpNow = Math.floor(pr * (wp - 1));
        if (fase >= 2 && fase <= 3 && wpNow !== wpAnt) { wpAnt = wpNow; if (wpNow > 0) linea(`WP ${wpNow}/${wp} alcanzado · desvío ${fmt1(Math.random() * 1.4)} m`, "telem", "WP:ok"); }
        if (s - ultTelem >= 1.5) {
          ultTelem = s;
          const lat = 38 + Math.round(Math.random() * 14);
          linea(`T+${mmss(s)} · ALT ${fmt0(altAct)} m · VEL ${fmt0(velAct)} km/h · BAT ${fmt0(batAct)} % · HDG ${String(Math.round(hdg)).padStart(3, "0")}° · LINK ${lat} ms`, "telem");
          $("#mi-link").textContent = `${lat} ms`; tk(fmt0(batAct), d.estado.gps, lat);
          if (fase === 2 && Math.random() < 0.45) linea(lidar && Math.random() < 0.5 ? `LiDAR · obstáculo a ${fmt0(d.lidar.alcance * (0.5 + Math.random() * 0.4))} m · corrección +${fmt0(2 + Math.random() * 4)} m` : `Detección IA · ${1 + Math.floor(Math.random() * 3)} personas · ${Math.floor(Math.random() * 2)} vehículos · georreferenciado`, "", "SIM:warn");
        }
        if (p < 1) requestAnimationFrame(paso);
        else {
          fases.forEach((li) => { li.classList.add("is-done"); li.classList.remove("is-now"); });
          $("#mi-fase").textContent = "EN TIERRA"; feed.className = "mission__feed"; vA.pause(); vB.pause();
          linea(`Misión completada · ${fmt1(dist)} km · ${fmt0(durMin)} min planificados · batería restante ${fmt0(100 - consumo)} %`, "", "FIN:ok");
          linea("Motores desarmados · registro de vuelo guardado", "", "OK:ok");
        }
      };
      requestAnimationFrame(paso);
    }
  }

  arrancar();
})();
