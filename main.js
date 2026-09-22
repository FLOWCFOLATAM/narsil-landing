/* Narsil Protocol — landing v3
   Sin dependencias. Navegación, video perezoso, revelado por opacidad y formulario. */

(function () {
  "use strict";

  // Cambia este valor por el buzón real antes de publicar.
  const CONTACT_EMAIL = "contacto@narsilprotocol.com";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  const hasIO = "IntersectionObserver" in window;
  if (!hasIO) document.documentElement.classList.add("no-io");

  // `?shot=1` fija la altura del hero y deja solo los pósters, para capturas de página completa.
  const shotMode = new URLSearchParams(location.search).has("shot");
  if (shotMode) {
    document.documentElement.style.setProperty("--hero-min", window.innerWidth < 700 ? "812px" : "900px");
  }

  /* ---------- Navegación ---------- */
  const nav = $("#nav");
  const burger = $("#burger");
  const menu = $("#menu");
  let heroBright = false; // ¿el video del hero es claro bajo la barra? (lo mide el muestreador de abajo)
  function onScroll() {
    // ¿La barra flota sobre una sección clara u oscura? Se mira qué hay bajo su centro.
    const stack = document.elementsFromPoint(Math.round(window.innerWidth / 2), 96).filter((el) => !nav.contains(el) && !menu.contains(el));
    const host = stack.length ? stack[0].closest(".hero, .band, .stage, .sec--ink, .footer, .ctabar__item--dark, .sec--paper, .sec--white, .ctabar__item--light") : null;
    const overHero = !!host && host.matches(".hero");
    const light = overHero ? heroBright : (!!host && !host.matches(".band, .stage, .sec--ink, .footer, .ctabar__item--dark"));
    nav.classList.toggle("nav--solid", light && !nav.classList.contains("nav--open"));
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function setMenu(open) {
    nav.classList.toggle("nav--open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", T(open ? "Cerrar menú" : "Abrir menú"));
    menu.hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
    onScroll();
  }
  burger.addEventListener("click", () => setMenu(menu.hidden));
  $$("a", menu).forEach((a) => a.addEventListener("click", () => setMenu(false)));
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) setMenu(false); });
  window.matchMedia("(min-width: 901px)").addEventListener("change", (e) => { if (e.matches) setMenu(false); });

  const year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- Video: carga perezosa y pausa fuera de pantalla ----------
     Los clips vienen de Pexels. `data-hd` en pantallas anchas, `data-sd` en
     móviles o con ahorro de datos. Con movimiento reducido se muestra el póster. */
  const videos = $$("video[data-hd]");
  function pickSource(v) {
    const wide = window.innerWidth >= 960 && !saveData;
    return (wide && v.dataset.hd) || v.dataset.sd || v.dataset.hd;
  }
  function loadVideo(v) {
    if (v.dataset.loaded || reducedMotion || shotMode) return;
    v.dataset.loaded = "1";
    v.src = pickSource(v);
    v.load();
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  }
  if (hasIO) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const v = en.target;
        if (en.isIntersecting) {
          loadVideo(v);
          if (v.dataset.loaded && v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
        } else if (v.dataset.loaded && !v.paused) {
          v.pause();
        }
      });
    }, { rootMargin: "400px 0px" });
    videos.forEach((v) => { if (v.dataset.eager) loadVideo(v); io.observe(v); });
  } else {
    videos.forEach(loadVideo);
  }

  /* ---------- Revelado estilo flow: líneas que entran y textos que bajan ---------- */
  // Titulares: cada línea (separada por <br>) va dentro de una máscara.
  $$(".reveal .display").forEach((h) => {
    if (h.querySelector(".line")) return;
    const parts = h.innerHTML.split(/<br\s*\/?>/i).map((t) => t.trim()).filter(Boolean);
    h.innerHTML = parts.map((t) => '<span class="line"><span>' + t + "</span></span>").join("");
  });
  $$(".reveal .signature > span").forEach((sp) => {
    if (sp.classList.contains("line")) return;
    sp.classList.add("line");
    sp.innerHTML = "<span>" + sp.innerHTML + "</span>";
  });
  // Textos secundarios: fundido hacia abajo, escalonado dentro de cada bloque.
  const FD = ".hero__sub, .hero__cta, .sec__lede, .statement, .facts > div, .list > li, .ctx, .flow__node, .split__col, .sheet__head, .specs > div, .caps > li, .coming, .disclaimer, .pillars3 > li, .band__foot p, .contact__meta, .form, .footnote, .mediacap p";
  $$(".reveal").forEach((block) => {
    let i = 0;
    $$(FD, block).forEach((el) => {
      el.classList.add("fd");
      el.style.setProperty("--d", (0.2 + Math.min(i, 10) * 0.06).toFixed(2) + "s");
      i += 1;
    });
  });
  /* ---------- Idioma: detecta el del sistema, recuerda la elección ---------- */
  const I18N = window.NARSIL_I18N;
  const T = (str) => (I18N ? I18N.t(str) : str);
  if (I18N) {
    I18N.apply(I18N.detect());
    document.documentElement.classList.remove("i18n-pending");
    $$(".lang__btn").forEach((b) => b.addEventListener("click", () => { I18N.apply(b.dataset.lang); burger.setAttribute("aria-label", T(menu.hidden ? "Abrir menú" : "Cerrar menú")); }));
  }

  const reveals = $$(".reveal");
  // Lo que ya está en pantalla al cargar (el hero, sobre todo) entra de inmediato;
  // el resto espera a asomar. Sin IntersectionObserver o con movimiento reducido, todo visible.
  const inView = (el) => { const r = el.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; };
  if (hasIO && !reducedMotion && !shotMode) {
    const ro = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("is-in"); ro.unobserve(en.target); }
      });
    }, { threshold: 0.08 });
    reveals.forEach((el) => { if (inView(el)) el.classList.add("is-in"); else ro.observe(el); });
    // Red de seguridad: si el observador no dispara (pestaña oculta), revelar al volver.
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reveals.forEach((el) => { if (inView(el)) el.classList.add("is-in"); }); });
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
  }

  /* ---------- Hero: video compuesto por varios clips en bucle ----------
     Dos capas de <video>; cada clip se sostiene unos segundos y funde al siguiente.
     Sin gráficos superpuestos. Con movimiento reducido o en modo captura, solo el póster. */
  const CLIPS = [
    { hd: "https://videos.pexels.com/video-files/32538554/13876743_1920_1080_24fps.mp4", sd: "https://videos.pexels.com/video-files/32538554/13876742_1280_720_24fps.mp4" },
    { hd: "assets/video/rosen-1080.mp4", sd: "assets/video/rosen-720.mp4", poster: "assets/video/rosen-poster.jpg" }, // pasillo del mall (Rosen), grabación propia
    { hd: "https://videos.pexels.com/video-files/10576687/10576687-hd_1920_1080_30fps.mp4", sd: "https://videos.pexels.com/video-files/10576687/10576687-hd_1280_720_60fps.mp4" },
    { hd: "https://videos.pexels.com/video-files/19942428/19942428-hd_1920_1080_30fps.mp4", sd: "https://videos.pexels.com/video-files/19942428/19942428-hd_1280_720_30fps.mp4" },
    { hd: "https://videos.pexels.com/video-files/8382434/8382434-hd_1920_1080_30fps.mp4", sd: "https://videos.pexels.com/video-files/8382434/8382434-hd_1280_720_30fps.mp4" },
    { hd: "https://videos.pexels.com/video-files/4457694/4457694-hd_1920_1080_24fps.mp4", sd: "https://videos.pexels.com/video-files/4457694/4457694-hd_1280_720_24fps.mp4" },
  ];
  const HOLD = 8; // segundos por clip
  const layers = $$(".hero__clip");
  if (layers.length === 2 && !reducedMotion && !shotMode) {
    let front = 0, idx = 0, swapping = false, heroVisible = true;
    const src = (c) => (window.innerWidth >= 960 && !saveData ? c.hd : c.sd);
    const safePlay = (v) => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
    const loadInto = (layer, i) => {
      const clip = CLIPS[i % CLIPS.length];
      layer.crossOrigin = "anonymous";
      if (clip.poster) layer.poster = clip.poster;
      layer.src = src(clip);
      layer.load();
    };
    const swap = () => {
      if (swapping) return;
      swapping = true;
      const back = layers[1 - front];
      const next = (idx + 1) % CLIPS.length;
      if (!back.src) loadInto(back, next);
      const go = () => {
        back.currentTime = 0;
        safePlay(back);
        back.classList.add("is-front");
        layers[front].classList.remove("is-front");
        setTimeout(() => {
          layers[front].pause();
          idx = next;
          front = 1 - front;
          loadInto(layers[1 - front], (idx + 1) % CLIPS.length);
          swapping = false;
        }, 1500);
      };
      if (back.readyState >= 3) go(); else { back.addEventListener("canplay", go, { once: true }); back.load(); }
    };
    layers.forEach((v) => {
      v.addEventListener("timeupdate", () => {
        if (v !== layers[front] || !heroVisible) return;
        const end = isFinite(v.duration) && v.duration > 2 ? Math.min(HOLD, v.duration - 1.2) : HOLD;
        if (v.currentTime >= end) swap();
      });
      v.addEventListener("ended", () => { if (v === layers[front]) swap(); });
      v.addEventListener("error", () => {
        // Clip que no carga: saltar al siguiente.
        if (v === layers[1 - front]) { idx = (idx + 1) % CLIPS.length; loadInto(v, (idx + 1) % CLIPS.length); }
      });
    });
    // Muestreo de luminancia: la franja superior del cuadro actual, donde flota la barra.
    // Si es clara, la barra pasa a vidrio claro con el logo en tinta (no se camufla).
    const probeCanvas = document.createElement("canvas");
    probeCanvas.width = 32; probeCanvas.height = 6;
    const pctx = probeCanvas.getContext("2d", { willReadFrequently: true });
    let probeFails = 0;
    function probeHero() {
      const v = layers[front];
      if (!heroVisible || probeFails > 3 || !v.videoWidth || v.readyState < 2) return;
      try {
        pctx.drawImage(v, 0, 0, v.videoWidth, Math.round(v.videoHeight * 0.16), 0, 0, 32, 6);
        const d = pctx.getImageData(0, 0, 32, 6).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        const lum = sum / (d.length / 4);
        const next = heroBright ? lum > 118 : lum > 138; // histéresis para no parpadear
        if (next !== heroBright) { heroBright = next; onScroll(); }
      } catch (e) { probeFails += 1; }
    }
    setInterval(probeHero, 600);
    loadInto(layers[0], 0);
    safePlay(layers[0]);
    layers[0].addEventListener("playing", () => { if (!layers[1].src) loadInto(layers[1], 1); }, { once: true });
    if (hasIO) {
      new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          heroVisible = en.isIntersecting;
          if (heroVisible) safePlay(layers[front]); else layers[front].pause();
        });
      }, { threshold: 0.05 }).observe($(".hero"));
    }
  }

  /* ---------- Contacto ---------- */
  const mailLink = $("#mail-link");
  if (mailLink) { mailLink.href = "mailto:" + CONTACT_EMAIL; mailLink.textContent = CONTACT_EMAIL; }
  const mailCta = $("#mail-cta");
  if (mailCta) mailCta.href = "mailto:" + CONTACT_EMAIL;
  const mailFoot = $("#mail-foot");
  if (mailFoot) { mailFoot.href = "mailto:" + CONTACT_EMAIL; mailFoot.textContent = CONTACT_EMAIL; }

  const form = $("#form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      let ok = true;
      $$(".field", form).forEach((f) => {
        const input = $("input, select, textarea", f);
        const valid = input.checkValidity();
        f.classList.toggle("is-invalid", !valid);
        if (!valid) ok = false;
      });
      const hint = $("#form-hint");
      if (!ok) { hint.textContent = T("Revisa los campos marcados."); return; }
      const d = new FormData(form);
      const subject = T("Solicitud de demo — ") + d.get("empresa") + " (" + d.get("sector") + ")";
      const body = [T("Nombre: ") + d.get("nombre"), T("Empresa: ") + d.get("empresa"), T("Correo: ") + d.get("correo"), T("Sector: ") + d.get("sector"), "", T("¿Qué necesitas observar?"), d.get("mensaje")].join("\n");
      window.location.href = "mailto:" + CONTACT_EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      hint.textContent = T("Si tu cliente de correo no se abrió, escríbenos a ") + CONTACT_EMAIL + ".";
    });
  }
})();

/* ============ DEMOS DESPLEGABLES ============ */
(() => {
  const filas = Array.from(document.querySelectorAll("[data-demo]"));
  if (!filas.length) return;

  const pocoMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* El video no se descarga hasta que la fila se abre. Son megas; pedirlos al
     cargar la portada por si alguien despliega es cobrarle el dato a todo el
     que no lo hace. */
  const reproducir = (v) => {
    const p = v.play();
    if (p && p.catch) p.catch(() => {});      // autoplay bloqueado: queda el poster
  };
  const encender = (li) => {
    const v = li.querySelector("video");
    if (!v) return;
    if (!v.src && v.dataset.src) {
      /* Asignar src dispara una carga que ABORTA un play() inmediato, y la
         promesa rechazada se pierde en el catch. Se espera a que haya datos.
         Sintoma: el desplegable abierto se quedaba en el poster, quieto. */
      v.src = v.dataset.src;
      v.addEventListener("canplay", () => reproducir(v), { once: true });
      return;
    }
    reproducir(v);
  };
  const apagar = (li) => {
    const v = li.querySelector("video");
    if (v && !v.paused) v.pause();
  };

  /* Solo una abierta: dos videos reproduciendo a la vez compiten por decodificador
     y ancho de banda, y en un movil eso se ve como tirones en los dos. */
  const abrir = (li) => {
    filas.forEach((otra) => {
      const esta = otra === li;
      otra.classList.toggle("is-open", esta);
      otra.querySelector(".demo__head").setAttribute("aria-expanded", String(esta));
      esta ? encender(otra) : apagar(otra);
    });
  };

  filas.forEach((li) => {
    li.querySelector(".demo__head").addEventListener("click", () => {
      if (li.classList.contains("is-open")) return;   // no se cierra sola: la
      abrir(li);                                      // seccion siempre ensena algo
    });
  });

  /* Al scrollear tambien avanza, como pidio el diseno. Se exige que la fila
     este bien dentro de la pantalla (no asomando) para que no vaya saltando
     de una a otra mientras se pasa de largo. */
  if ("IntersectionObserver" in window && !pocoMovimiento) {
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (e.isIntersecting && !e.target.classList.contains("is-open")) abrir(e.target);
      });
    }, { rootMargin: "-38% 0px -38% 0px", threshold: 0 });
    filas.forEach((li) => io.observe(li));
  }

  /* El navegador PAUSA el video mudo cuando la pestana pierde el foco, para
     ahorrar bateria: "video-only background media was paused to save power".
     No es un error nuestro, pero al volver hay que reanudar o la seccion se
     queda con un fotograma congelado y parece rota. */
  const reanudar = () => {
    const abierta = filas.find((li) => li.classList.contains("is-open"));
    if (abierta && document.visibilityState === "visible") encender(abierta);
  };
  document.addEventListener("visibilitychange", reanudar);
  window.addEventListener("focus", reanudar);

  const primera = filas[0];
  if (primera) {
    const v = primera.querySelector("video");
    /* La primera arranca abierta, pero su video espera a que la seccion asome:
       si no, se descarga en cuanto carga la portada aunque nadie baje hasta aqui. */
    if ("IntersectionObserver" in window) {
      const io2 = new IntersectionObserver((es) => {
        es.forEach((e) => { if (e.isIntersecting) { encender(primera); io2.disconnect(); } });
      }, { rootMargin: "200px" });
      io2.observe(primera);
    } else if (v && v.dataset.src) {
      v.src = v.dataset.src;
    }
  }
})();
