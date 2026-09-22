# Narsil Protocol — landing

Sitio estático de una sola página. Sin build, sin dependencias: `index.html`, `styles.css`, `main.js`, `i18n.js` y `assets/`.

## Ver en local

```bash
python3 -m http.server 4310 --directory .
```

y abrir http://localhost:4310.

## Publicar

Cualquier hosting estático sirve (Vercel, Netlify, S3 + CloudFront). En Vercel: importar la carpeta como proyecto "Other", sin comando de build, directorio de salida `.`.

## Antes de publicar

1. **Correo de contacto.** El formulario abre el cliente de correo del visitante con la solicitud lista. El buzón está en `main.js` (`CONTACT_EMAIL`). Si se prefiere un envío sin cliente de correo, reemplazar el `submit` por un POST a Formspree, Resend o una función propia.
2. **Videos.** Vienen enlazados directamente desde el CDN de Pexels (licencia Pexels, sin atribución obligatoria). Para producción conviene descargarlos, comprimirlos (H.264, ~6–8 Mbps para 1080p) y servirlos desde el propio hosting o un bucket. Los tres clips y sus IDs:
   - Hero (secuencia en bucle, ocho segundos por clip, fundido de 1,4 s): calle de noche https://www.pexels.com/video/32538554/ → pasillo del mall frente a Rosen (grabación propia, `assets/video/rosen-*.mp4`, tramo 48–60 s de `narsil/data/mall/pasillo-rosen-norm.mp4`, interpolado de 15 a 30 fps; `rosen-poster.jpg` corresponde al primer cuadro del clip) → línea de producción https://www.pexels.com/video/10576687/ → campo con tractor https://www.pexels.com/video/19942428/ → mina a cielo abierto https://www.pexels.com/video/8382434/ → dron sobre cerros https://www.pexels.com/video/4457694/ . La lista está en `CLIPS` dentro de `main.js`.
   - Manifiesto, Costa Verde de Lima: https://www.pexels.com/video/19909718/
   - Plataforma, puerto con grúas al atardecer: https://www.pexels.com/video/10452360/
   - Visión, carretera en los Andes (Bolivia): https://www.pexels.com/video/39306854/
   - Horizonte, dron sobre cerros desérticos: https://www.pexels.com/video/4457694/
   - Primer paso, ciudad costera de noche: https://www.pexels.com/video/35172621/
3. **Imágenes de marca.** `assets/brand/` contiene recortes del brand system (renders de cámara, borde, cuadros, laptop y gimbal; fotos de los cinco contextos). Las cinco fotos y los cuatro renders que usa la landing se recortaron de nuevo desde las láminas maestras de 1672 px: se eliminaron restos de texto, bandas y conectores, se quitó la máscara de enfoque y el escalado 2× usa bicúbico para evitar halos. Cada imagen servida tiene una variante 1× (`-294` para contextos, `-336` para pipeline) y otra 2× mediante `srcset`. Cuando existan los originales en alta resolución, reemplazar ambas variantes manteniendo los nombres y proporciones.
4. **Idioma.** El HTML es la fuente en español. `i18n.js` traduce al inglés cada nodo de texto y atributo con un diccionario (clave = texto español exacto); el toggle ES/EN vive en la barra, la elección se guarda en `localStorage` y, sin elección previa, se toma el idioma del navegador (`es*` → español, el resto → inglés). Al añadir o cambiar un texto en el HTML hay que añadir su entrada en `EN`; un texto sin entrada se queda en español.
5. **Barra flotante.** El header es una ventana de vidrio (fondo translúcido con `backdrop-filter`, esquinas de 18 px, hairline y sombra suave) separada 16 px del borde. Cambia a vidrio claro con logo en tinta cuando flota sobre una sección clara (detección por clase de sección en `onScroll`) o cuando el video del hero es claro bajo la barra (`probeHero` muestrea la luminancia de la franja superior del cuadro cada 0,6 s; requiere `crossorigin` en los clips, y Pexels lo permite). La franja de industrias va transparente sobre el video del hero.
6. **Sin gráficos sobre el video.** Por decisión del cliente (22-09-2026) no hay marcos, etiquetas ni eyebrows: el video va natural y los textos entran con la animación de flow-cfo (líneas que suben dentro de una máscara y textos que bajan con fundido).
7. **Logo.** `assets/` contiene el archivo maestro dividido: `narsil-mark.svg` (símbolo), `narsil-lockup.svg` (firma horizontal: símbolo + NARSIL con PROTOCOL debajo, compuesta con los glifos del maestro) y `narsil-lockup-vertical.svg` (firma tal cual la entregó el cliente). En la página van inline como `<symbol id="mark">` y `<symbol id="lockup">` y toman el color del texto (`currentColor`). Ya no se cargan Sarpanch ni Michroma.
8. **Legal.** Los enlaces de Privacidad y Términos del pie están vacíos.

## Capturas

`?shot=1` en la URL fija la altura del hero para capturas de página completa con Chrome headless:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --window-size=1440,10300 --virtual-time-budget=9000 --screenshot=narsil.png "http://localhost:4310/?shot=1"
```

## Referencias

La mezcla concreta de ambas referencias (22-09-2026): de Anduril, la ficha de características en filas etiqueta/valor, el bloque tipográfico gigante de una idea (la firma «Ver. Entender. Decidir.»), la leyenda en dos partes bajo el video a sangre y el pie con correo; de Palantir, los chips de sub-navegación bajo el hero, las secciones numeradas, el párrafo grande centrado, las barras de contacto dobles y la nota de responsabilidad al final de Capacidades. Las páginas y hojas de estilo descargadas de ambos sitios quedaron fuera del repo (scratchpad de la sesión).

La escala tipográfica y el ritmo vienen del sistema de diseño de palantir.com (variables `--headline-100/200/300`, cuerpo de 18 px, contenedor de 80 rem, captions de 10 px, secciones numeradas, bloque de contacto doble), leído de sus hojas de estilo públicas. La estructura de portada (hero, franja, párrafo grande, lista de plataformas, tarjetas, contacto doble) sigue el mismo orden. Anduril aporta la grilla de industrias y el pie.

## Identidad

Tokens en `:root` de `styles.css`, según el brand system 2026: Porcelana `#F4F7FB`, Noche `#08111F`, Cobalto `#176BFF`, Hielo `#86C5FF`. Tipografía IBM Plex Sans (titulares en Regular, párrafos grandes en Light) e IBM Plex Mono para etiquetas con tracking. El wordmark es vector del archivo maestro, no una fuente. Segunda línea del titular en Cobalto (`<em>`). Sin animaciones más allá del video y un fundido de opacidad. Reglas de marca: siempre "Narsil Protocol", nunca "Narsil" a secas; el logo no lleva sombras ni contornos; usar el archivo maestro cuando exista.
