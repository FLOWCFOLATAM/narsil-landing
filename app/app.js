/* Narsil Protocol — Centro de mando (maqueta interactiva para inversores)
 *
 * Que es real y que es maqueta, para que nadie lo confunda:
 *   - El acceso es real: Amazon Cognito, flujo de codigo con PKCE. Ninguna
 *     contrasena pasa por este sitio.
 *   - Los videos son corridas reales del motor con su overlay ya pintado.
 *   - Las alertas, embudos y conteos salen de los escenarios exportados por el
 *     motor (app/data/*.json): son los eventos que dispararon de verdad, en el
 *     instante en que ocurrieron. No se inventa ninguno.
 *   - Lo simulado esta marcado en pantalla (DEMO DATA, PROYECCION): compras,
 *     ERP, y la mision de dron entera.
 */
(() => {
  "use strict";

  /* ============ CONFIGURACION DE ACCESO ============ */
  // Identificadores publicos de un cliente publico: no son secretos.
  const AUTH = {
    domain: "narsil-protocol-c8c094.auth.us-east-1.amazoncognito.com",
    clientId: "1h13ehjo696shqevvuo3hf0ff3",
    scope: "openid email profile",
  };
  // Cognito exige que redirect_uri coincida EXACTAMENTE con la registrada,
  // barra final incluida. Se calcula, no se escribe a mano, para que valga
  // igual en GitHub Pages y en localhost.
  const REDIRECT = (() => {
    let p = location.pathname;
    if (!p.endsWith("/")) p = p.replace(/[^/]*$/, "");
    return location.origin + p;
  })();

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmt1 = (n) => n.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt0 = (n) => Math.round(n).toLocaleString("es-PE");

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
    if (state !== sessionStorage.getItem("pkce_state")) throw new Error("El estado de la sesion no coincide. Vuelve a entrar.");
    const body = new URLSearchParams({
      grant_type: "authorization_code", client_id: AUTH.clientId, code,
      redirect_uri: REDIRECT, code_verifier: sessionStorage.getItem("pkce_verifier") || "",
    });
    const r = await fetch(`https://${AUTH.domain}/oauth2/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    if (!r.ok) throw new Error(`Cognito rechazo el canje (${r.status}).`);
    const t = await r.json();
    sessionStorage.setItem("sesion", JSON.stringify({ id: t.id_token, exp: Date.now() + (t.expires_in || 3600) * 1000 }));
    sessionStorage.removeItem("pkce_verifier"); sessionStorage.removeItem("pkce_state");
  }

  function sesion() {
    try {
      const s = JSON.parse(sessionStorage.getItem("sesion") || "null");
      if (!s || Date.now() > s.exp) return null;
      const payload = JSON.parse(atob(s.id.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload;
    } catch { return null; }
  }

  function logout() {
    sessionStorage.removeItem("sesion");
    const q = new URLSearchParams({ client_id: AUTH.clientId, logout_uri: REDIRECT });
    location.assign(`https://${AUTH.domain}/logout?${q}`);
  }

  /* ============ ARRANQUE ============ */
  async function arrancar() {
    const gate = $("#gate"), app = $("#app"), err = $("#gate-err");
    $("#gate-foot").textContent = `redirect_uri · ${REDIRECT}`;
    $("#btn-login").addEventListener("click", () => login().catch((e) => { err.textContent = e.message; err.hidden = false; }));
    $("#btn-logout").addEventListener("click", logout);

    const u = new URL(location.href);
    if (u.searchParams.get("code")) {
      try {
        await canjear(u.searchParams.get("code"), u.searchParams.get("state"));
        history.replaceState({}, "", REDIRECT);
      } catch (e) {
        history.replaceState({}, "", REDIRECT);
        err.textContent = e.message; err.hidden = false;
      }
    } else if (u.searchParams.get("error")) {
      err.textContent = u.searchParams.get("error_description") || u.searchParams.get("error");
      err.hidden = false;
      history.replaceState({}, "", REDIRECT);
    }

    const claims = sesion();
    if (!claims) { gate.hidden = false; app.hidden = true; return; }
    gate.hidden = true; app.hidden = false;
    $("#rail-user").textContent = claims.email || claims["cognito:username"] || "sesion activa";
    iniciarApp();
  }

  /* ============ APLICACION ============ */
  const TITULOS = {
    seguridad: ["Seguridad", "Eventos y evidencia"],
    retail: ["Retail", "Tránsito y atención al local"],
    produccion: ["Producción", "Conteo y ritmo de línea"],
    flota: ["Flota y pre-vuelo", "Drones · planificación de misión"],
  };
  const REGLAS = {
    restricted_zone_intrusion: "Intrusión en zona restringida",
    loitering: "Merodeo", crowd_density: "Aglomeración", repeated_crossing: "Cruces repetidos",
  };
  const SEV = { high: "Alta", medium: "Media", low: "Baja" };

  function iniciarApp() {
    reloj();
    pestanas();
    cargar("data/seguridad.json").then(seguridad);
    cargar("data/rosen.json").then(retail);
    cargar("data/produccion.json").then(produccion);
    flota();
  }

  const cargar = (p) => fetch(p, { cache: "no-store" }).then((r) => r.json());

  /* play() falla en silencio si el video aun no tiene datos, y el navegador
     pausa el video mudo cuando la pestana pierde el foco. Las dos cosas dejan
     un panel congelado en cero, porque todo va sincronizado al tiempo del
     video. Se reintenta al tener datos y al recuperar el foco. */
  function reproducir(v) {
    const p = v.play();
    if (p && p.catch) p.catch(() => { v.addEventListener("canplay", () => v.play().catch(() => {}), { once: true }); });
  }
  const reanudarActivo = () => {
    if (document.visibilityState !== "visible") return;
    $$(".view.is-active video").forEach((v) => { if (v.src && v.paused) reproducir(v); });
  };
  document.addEventListener("visibilitychange", reanudarActivo);
  window.addEventListener("focus", reanudarActivo);

  function reloj() {
    const el = $("#top-clock");
    const tick = () => { el.textContent = new Date().toLocaleTimeString("es-PE", { hour12: false }); };
    tick(); setInterval(tick, 1000);
  }

  function pestanas() {
    $$(".tab").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.tab;
      $$(".tab").forEach((x) => x.classList.toggle("is-active", x === b));
      $$(".view").forEach((v) => {
        const activa = v.dataset.view === id;
        v.classList.toggle("is-active", activa);
        // Un solo video reproduciendose: dos a la vez compiten por decodificador.
        $$("video", v).forEach((vid) => { if (activa && vid.src) reproducir(vid); else vid.pause(); });
      });
      $("#top-label").textContent = TITULOS[id][0]; $("#top-title").textContent = TITULOS[id][1];
    }));
  }

  /* Sincroniza un video con sus eventos: llama a `fn(t)` en cada fotograma
     pintado y avisa cuando el bucle vuelve a empezar. */
  function seguir(video, barra, tEl, fn) {
    let ultimo = -1;
    const paso = () => {
      const t = video.currentTime || 0;
      if (t < ultimo - 0.5) fn(-1);        // el bucle reinicio
      ultimo = t;
      const d = video.duration || 1;
      if (barra) barra.style.width = `${Math.min(100, (t / d) * 100)}%`;
      if (tEl) tEl.textContent = `t = ${fmt1(t)} s`;
      fn(t);
      requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  function marcas(timeline, eventos, dur, clase = "") {
    eventos.forEach((e) => {
      const m = document.createElement("i");
      m.className = `timeline__mark ${clase}`;
      m.style.left = `${Math.max(0, Math.min(100, (e.t / dur) * 100))}%`;
      timeline.appendChild(m);
    });
  }

  /* ---------- SEGURIDAD ---------- */
  function seguridad(d) {
    // El clip publicado es el tramo 4-18 s de la corrida: se desplazan los
    // tiempos y se descartan los eventos que caen fuera.
    const INI = 4, FIN = 18;
    const ev = d.eventos
      .filter((e) => (e.t_fin ?? e.t) >= INI && e.t <= FIN)
      .map((e) => ({ ...e, t: Math.max(0, e.t - INI), t_fin: Math.min(FIN, e.t_fin ?? e.t) - INI }))
      .sort((a, b) => a.t - b.t);

    $("#seg-personas").textContent = d.kpis.entidades_unicas ?? "—";
    $("#seg-eventos").textContent = ev.length;
    const reglas = $("#seg-reglas");
    const porRegla = {};
    ev.forEach((e) => { (porRegla[e.regla] ||= new Set()).add(e.zona); });
    Object.entries(porRegla).forEach(([r, zonas]) => {
      const li = document.createElement("li");
      li.innerHTML = `${REGLAS[r] || r} <i>· ${[...zonas].join(", ")} · solo personas · excepto cruce</i>`;
      reglas.appendChild(li);
    });

    const video = $("#seg-video"), lista = $("#seg-alertas"), vacio = $("#seg-vacio");
    marcas($("#seg-timeline"), ev, FIN - INI);
    const atendidas = new Set();
    let filtro = "todas", sel = null, mostrados = new Set();

    const pinta = (e) => {
      const li = document.createElement("li");
      li.className = `alert alert--${e.severidad}${atendidas.has(e.uid) ? " is-atendida" : ""}`;
      li.dataset.uid = e.uid; li.dataset.sev = e.severidad;
      li.innerHTML = `<span class="alert__t">${fmt1(e.t)} s</span>
        <span><span class="alert__regla">${SEV[e.severidad] || e.severidad} · ${REGLAS[e.regla] || e.regla}</span>
        <span class="alert__texto">${e.texto}</span></span><span class="alert__zona">${e.zona}</span>`;
      li.addEventListener("click", () => detalle(e, li));
      li.hidden = !(filtro === "todas" || filtro === e.severidad);
      lista.prepend(li);
      vacio.hidden = true;
    };
    const detalle = (e, li) => {
      sel = e;
      $$(".alert", lista).forEach((x) => x.classList.toggle("is-sel", x === li));
      $("#seg-detalle").hidden = false;
      $("#det-sev").textContent = `${SEV[e.severidad] || e.severidad} · ${REGLAS[e.regla] || e.regla}`;
      $("#det-sev").style.color = e.severidad === "high" ? "var(--alerta)" : e.severidad === "medium" ? "var(--warn)" : "var(--ok)";
      $("#det-texto").textContent = e.texto;
      $("#det-zona").textContent = e.zona;
      $("#det-t").textContent = `${fmt1(e.t)} s`;
      $("#det-dur").textContent = `${fmt1(Math.max(0, e.t_fin - e.t))} s`;
      $("#det-ent").textContent = (e.entidades || []).map((n) => `#${n}`).join(", ") || "—";
      $("#det-atender").textContent = atendidas.has(e.uid) ? "Reabrir" : "Marcar atendida";
    };
    $("#seg-cerrar").addEventListener("click", () => { $("#seg-detalle").hidden = true; $$(".alert", lista).forEach((x) => x.classList.remove("is-sel")); });
    $("#det-ver").addEventListener("click", () => { if (!sel) return; video.currentTime = Math.max(0, sel.t - 0.2); video.play().catch(() => {}); });
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
    const abiertas = (t) => {
      const n = ev.filter((e) => e.t <= t && t <= e.t_fin + 0.3 && !atendidas.has(e.uid)).length;
      $("#seg-abiertas").textContent = n;
    };

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
    const dirs = d.kpis.por_direccion || {};
    const totalDir = Object.values(dirs).reduce((a, b) => a + b, 0) || 1;
    const barras = $("#ret-dir");
    const ETIQ = { "izq->der": "Izquierda → derecha", "der->izq": "Derecha → izquierda", "sin rumbo claro": "Sin rumbo claro" };
    Object.entries(dirs).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      const row = document.createElement("div"); row.className = "bar";
      row.innerHTML = `<span>${ETIQ[k] || k}</span><i><b style="--w:${(v / totalDir) * 100}%"></b></i><em>${v}</em>`;
      barras.appendChild(row);
    });

    const lista = $("#ret-eventos");
    let mostrados = new Set();
    const hasta = (serie, t) => { let v = 0; for (const [tt, x] of serie) { if (tt <= t) v = x; else break; } return v; };
    const canvas = $("#ret-spark"), ctx = canvas.getContext("2d");
    const puntos = ocup.map(([t, z]) => [t, z.pasillo ?? Math.max(0, ...Object.values(z))]);
    const maxO = Math.max(1, ...puntos.map((p) => p[1]));

    const spark = (t) => {
      const W = canvas.width, H = canvas.height; ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(244,247,251,0.14)"; ctx.beginPath(); ctx.moveTo(0, H - 14); ctx.lineTo(W, H - 14); ctx.stroke();
      ctx.beginPath(); ctx.strokeStyle = "#86C5FF"; ctx.lineWidth = 2;
      puntos.forEach(([tt, v], i) => { const x = (tt / dur) * W, y = H - 14 - (v / maxO) * (H - 28); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      const x = (t / dur) * W; ctx.strokeStyle = "#176BFF"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, H - 14); ctx.stroke();
      ctx.fillStyle = "rgba(244,247,251,0.5)"; ctx.font = "11px IBM Plex Mono"; ctx.fillText(`máx ${maxO}`, 6, 14);
    };

    seguir(video, $("#ret-bar"), $("#ret-t"), (t) => {
      if (t < 0) { lista.innerHTML = ""; mostrados = new Set(); return; }
      const pasaron = hasta(conteo, t);
      const detEv = ev.filter((e) => e.t <= t);
      // De los que pasaron, cuantos se detuvieron: el segundo escalon nunca
      // supera al primero, o el embudo deja de ser un embudo.
      const detenidos = Math.min(pasaron, new Set(detEv.flatMap((e) => e.entidades || [])).size);
      const compras = Math.round(detenidos * 0.635);
      $("#ret-pasaron").textContent = pasaron;
      $("#ret-detenidos").textContent = detenidos;
      $("#ret-compras").textContent = compras;
      $("#ret-detbar").style.setProperty("--w", `${pasaron ? (detenidos / pasaron) * 100 : 0}%`);
      $("#ret-combar").style.setProperty("--w", `${pasaron ? (compras / pasaron) * 100 : 0}%`);
      const tasa = pasaron ? (detenidos / pasaron) * 100 : null;
      $("#ret-atencion").textContent = tasa === null ? "—" : `${fmt1(tasa)} %`;
      $("#ret-tasa").textContent = tasa === null ? "— se detienen a mirar" : `↓ ${fmt1(tasa)} % se detienen a mirar`;
      $("#ret-ahora").textContent = hasta(puntos, t);
      detEv.forEach((e) => {
        if (mostrados.has(e.uid)) return; mostrados.add(e.uid);
        const li = document.createElement("li"); li.className = "alert alert--low";
        li.innerHTML = `<span class="alert__t">${fmt1(e.t)} s</span><span><span class="alert__regla">Interés · ${REGLAS[e.regla] || e.regla}</span><span class="alert__texto">${e.texto}</span></span><span class="alert__zona">${e.zona}</span>`;
        lista.prepend(li);
      });
      spark(t);
    });
  }

  /* ---------- PRODUCCION ---------- */
  function produccion(d) {
    const video = $("#pro-video"), dur = d.duracion || 12.28;
    const conteo = d.series.conteo || [];
    const total = d.kpis.entidades_unicas || (conteo.length ? conteo[conteo.length - 1][1] : 0);
    const hasta = (t) => { let v = 0; for (const [tt, x] of conteo) { if (tt <= t) v = x; else break; } return v; };
    const canvas = $("#pro-spark"), ctx = canvas.getContext("2d");
    const deltas = conteo.map(([t, v], i) => [t, i ? v - conteo[i - 1][1] : v]);
    const maxD = Math.max(1, ...deltas.map((p) => p[1]));
    const spark = (t) => {
      const W = canvas.width, H = canvas.height; ctx.clearRect(0, 0, W, H);
      const bw = Math.max(2, W / Math.max(1, dur) - 3);
      deltas.forEach(([tt, v]) => {
        const x = (tt / dur) * W, h = (v / maxD) * (H - 28);
        ctx.fillStyle = tt <= t ? "#176BFF" : "rgba(244,247,251,0.12)";
        ctx.fillRect(x, H - 14 - h, bw, h);
      });
      ctx.fillStyle = "rgba(244,247,251,0.5)"; ctx.font = "11px IBM Plex Mono"; ctx.fillText(`máx ${maxD} u/s`, 6, 14);
    };
    seguir(video, $("#pro-bar"), $("#pro-t"), (t) => {
      if (t < 0) return;
      // Progresivo: el total final es el que verifico el motor (31), asi que
      // el acumulado se acota a el aunque la serie se muestree cada segundo.
      const u = Math.min(total, hasta(t) + (t >= dur - 0.4 ? total - hasta(dur) : 0));
      $("#pro-unidades").textContent = u;
      // Una tasa con un denominador de medio segundo no significa nada.
      const medible = t >= 3;
      const ritmo = medible ? (u / t) * 60 : null;
      $("#pro-ritmo").textContent = ritmo === null ? "—" : fmt0(ritmo);
      $("#pro-turno").textContent = ritmo === null ? "—" : fmt0(ritmo * 60 * 8);
      spark(t);
    });
  }

  /* ---------- FLOTA Y PRE-VUELO ---------- */
  const DRONES = [
    {
      id: "sentinel", nombre: "Narsil Sentinel", tipo: "Quadcopter de vigilancia y percepción",
      video: "https://videos.pexels.com/video-files/34709265/14711662_2560_1440_30fps.mp4",
      autonomia: [15, 20], vel: [30, 50], carga: [0.3, 0.6], lidar: { modelo: "Garmin LiDAR-Lite v4", alcance: 10 },
      specs: { Sensores: "RGB 12 MP · LiDAR · GPS M10", Navegación: "ArduPilot · MAVLink", Estructura: "F450 · 450 mm · 4 × 920 KV", Batería: "LiPo 5000 mAh", Cómputo: "Raspberry Pi 5 · 4 GB", Presupuesto: "S/ 2.500" },
      usos: ["Perímetros", "Seguridad municipal", "Obras", "Infraestructura", "Rescate cercano", "Tráfico"],
      estado: { bat: 96, gps: 14, horas: 12.4 }, vtol: false,
    },
    {
      id: "ranger", nombre: "Narsil Ranger VTOL", tipo: "Tiltrotor de vigilancia y cobertura extendida",
      video: "https://videos.pexels.com/video-files/7132177/7132177-uhd_2560_1440_24fps.mp4",
      autonomia: [45, 60], vel: [60, 85], carga: [0.5, 1.0], lidar: { modelo: "Garmin LiDAR-Lite v3", alcance: 40 },
      specs: { Sensores: "RGB 12 MP · LiDAR · GPS M10", Navegación: "ArduPilot · MAVLink", Estructura: "Envergadura 1,8–2,0 m · 4 rotores basculantes", Batería: "LiPo 6S", Cómputo: "Raspberry Pi 5", Presupuesto: "S/ 3.500" },
      usos: ["Fronteras", "Patrullaje rural", "Corredores", "Infraestructura crítica", "Ambiental", "Búsqueda y rescate"],
      estado: { bat: 88, gps: 16, horas: 31.2 }, vtol: true,
    },
  ];

  function flota() {
    const cards = $("#fleet-cards"), sel = $("#pf-dron");
    DRONES.forEach((d, i) => {
      const card = document.createElement("article");
      card.className = `drone${i === 0 ? " is-sel" : ""}`; card.dataset.id = d.id;
      card.innerHTML = `<div class="drone__media"><video muted loop playsinline preload="none" data-src="${d.video}"></video>
          <div class="drone__status"><span class="ok">● LISTO</span><span>BAT ${d.estado.bat} %</span><span>GPS ${d.estado.gps} SAT</span></div></div>
        <div class="drone__body"><h2 class="drone__name">${d.nombre}</h2><p class="drone__type">${d.tipo}</p>
          <ul class="specs">
            <li><span>Autonomía</span><b>${d.autonomia[0]}–${d.autonomia[1]} min</b></li>
            <li><span>Crucero</span><b>${d.vel[0]}–${d.vel[1]} km/h</b></li>
            <li><span>Carga útil</span><b>${fmt1(d.carga[0])}–${fmt1(d.carga[1])} kg</b></li>
            ${Object.entries(d.specs).map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join("")}
            <li><span>Horas de vuelo</span><b>${fmt1(d.estado.horas)} h</b></li>
          </ul>
          <div class="drone__usos">${d.usos.map((u) => `<span>${u}</span>`).join("")}</div></div>`;
      card.addEventListener("click", () => { sel.value = d.id; sel.dispatchEvent(new Event("change")); });
      cards.appendChild(card);
      const o = document.createElement("option"); o.value = d.id; o.textContent = d.nombre; sel.appendChild(o);
    });
    // Los clips de las tarjetas se descargan al abrir la pestana de flota, no antes.
    $('.tab[data-tab="flota"]').addEventListener("click", () => {
      $$(".drone video").forEach((v) => { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); });
    }, { once: true });

    const f = {
      dron: sel, modo: $("#pf-modo"), dist: $("#pf-dist"), alt: $("#pf-alt"), vel: $("#pf-vel"), carga: $("#pf-carga"),
      lidar: $("#pf-lidar"), wp: $("#pf-wp"), checks: $$("[data-chk]"), btn: $("#pf-autorizar"),
    };
    const dron = () => DRONES.find((d) => d.id === f.dron.value) || DRONES[0];

    const calcular = () => {
      const d = dron();
      $$(".drone").forEach((c) => c.classList.toggle("is-sel", c.dataset.id === d.id));
      $("#pf-dron-nombre").textContent = d.nombre;
      f.vel.min = d.vel[0]; f.vel.max = d.vel[1];
      let vel = Math.min(Math.max(+f.vel.value, d.vel[0]), d.vel[1]);
      const alt = +f.alt.value, dist = +f.dist.value, carga = +f.carga.value, wp = +f.wp.value, lidar = f.lidar.checked;
      let nota = [];
      // Con LiDAR y vuelo bajo, el evitador de obstaculos limita la velocidad:
      // no se puede frenar a tiempo por debajo de su alcance util.
      if (lidar && alt < 40) { const tope = Math.round(d.vel[0] + (d.vel[1] - d.vel[0]) * 0.6); if (vel > tope) { vel = tope; nota.push(`Velocidad limitada a ${tope} km/h: a ${alt} m con LiDAR activo.`); } }
      f.vel.value = vel;
      $("#pf-dist-v").textContent = `${fmt1(dist)} km`; $("#pf-alt-v").textContent = `${alt} m`;
      $("#pf-vel-v").textContent = `${vel} km/h`; $("#pf-carga-v").textContent = `${fmt1(carga)} kg`; $("#pf-wp-v").textContent = wp;

      // Duracion: crucero + 0,4 min por waypoint (giro y estabilizacion) + 2 min
      // de despegue y aterrizaje. Autonomia: el limite bajo de la ficha, que es
      // el conservador. La carga por encima del 70 % de la maxima resta 15 %.
      const durMin = (dist / vel) * 60 + wp * 0.4 + 2;
      let auto = d.autonomia[0];
      if (carga > d.carga[1] * 0.7) { auto *= 0.85; nota.push("Carga alta: autonomía reducida un 15 %."); }
      const reserva = auto - durMin, consumo = (durMin / auto) * 100;
      const swath = alt * 1.15 / 1000;             // franja vista por la camara, km
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
      const listo = f.checks.every((c) => c.checked);
      f.btn.disabled = !(listo && v !== "no");
      f.btn.textContent = !listo ? `Completa la lista (${f.checks.filter((c) => c.checked).length}/${f.checks.length})` : v === "no" ? "Plan no viable" : "Autorizar y simular vuelo";
      return { d, durMin, auto, consumo, dist, alt, vel };
    };
    [f.dron, f.modo, f.dist, f.alt, f.vel, f.carga, f.lidar, f.wp, ...f.checks].forEach((el) => el.addEventListener("input", calcular));
    f.dron.addEventListener("change", calcular);
    calcular();

    f.btn.addEventListener("click", () => simular(calcular()));
  }

  function simular({ d, durMin, auto, consumo, dist, alt, vel }) {
    const m = $("#mision"); m.hidden = false; m.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const vid = $("#mi-video"); if (!vid.src) vid.src = vid.dataset.src; vid.play().catch(() => {});
    const fases = $$("#mi-fases li"), log = $("#mi-log");
    fases[1].textContent = d.vtol ? "Transición" : "Ascenso";
    // Cinco fases comprimidas en ~14 s de reloj. Los numeros del HUD siguen
    // al plan calculado; la mision entera es simulada y va marcada como tal.
    const plan = [["Despegue", 1.6], [d.vtol ? "Transición" : "Ascenso", 1.6], ["Crucero", 7.6], ["Retorno", 2.0], ["Aterrizaje", 1.4]];
    const total = plan.reduce((a, p) => a + p[1], 0);
    const t0 = performance.now(); log.textContent = ""; let faseAnt = -1;
    const linea = (s) => { log.textContent += `${new Date().toLocaleTimeString("es-PE", { hour12: false })}  ${s}\n`; log.scrollTop = log.scrollHeight; };
    linea(`${d.nombre} · plan aceptado · ${fmt0(durMin)} min · ${fmt0(consumo)} % de batería`);
    const paso = () => {
      const s = (performance.now() - t0) / 1000, p = Math.min(1, s / total);
      let acc = 0, fase = plan.length - 1;
      for (let i = 0; i < plan.length; i++) { if (s < acc + plan[i][1]) { fase = i; break; } acc += plan[i][1]; }
      if (fase !== faseAnt) { faseAnt = fase; fases.forEach((li, i) => { li.classList.toggle("is-done", i < fase); li.classList.toggle("is-now", i === fase); }); $("#mi-fase").textContent = plan[fase][0].toUpperCase(); linea(`Fase: ${plan[fase][0]}`); }
      const perfil = fase === 0 ? p * 4 : fase >= 3 ? Math.max(0, 1 - (p - 0.75) * 4) : 1;
      $("#mi-alt").textContent = fmt0(alt * Math.min(1, perfil));
      $("#mi-vel").textContent = fmt0(vel * (fase === 2 ? 1 : fase === 1 || fase === 3 ? 0.6 : 0.15));
      $("#mi-bat").textContent = fmt0(100 - consumo * p);
      $("#mi-dist").textContent = fmt1(dist * Math.min(1, Math.max(0, (s - plan[0][1] - plan[1][1]) / plan[2][1])));
      $("#mi-bar").style.width = `${p * 100}%`;
      if (p < 1) requestAnimationFrame(paso);
      else { fases.forEach((li) => { li.classList.add("is-done"); li.classList.remove("is-now"); }); $("#mi-fase").textContent = "EN TIERRA"; linea(`Misión completada · ${fmt1(dist)} km · batería restante ${fmt0(100 - consumo)} %`); }
    };
    requestAnimationFrame(paso);
  }

  arrancar();
})();
