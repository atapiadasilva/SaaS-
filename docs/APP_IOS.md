# App iOS de Hilo Digital — ruta de trabajo

Objetivo: una app para iPhone/iPad que sirva para **visualizar** (incluido el modelo
BIM) y **reportar** desde terreno. Primero en modo desarrollador/beta, después en
App Store.

> La PWA de terreno completa (offline duro, checklists, sincronización) no está en
> este alcance: la desarrolla la empresa externa. Acá se construye la app contenedor
> y las vistas móviles de visualización y reporte.

## Restricciones que mandan sobre el plan

1. **No hay Mac.** Compilar y firmar iOS exige macOS + Xcode. Sin Mac, la única vía
   es un servicio de build en la nube que alquila Macs (Codemagic, EAS, GitHub
   Actions con runner `macos-latest`). Es viable y se maneja entero desde Windows.
2. **No hay cuenta Apple Developer.** Sin ella no existe TestFlight ni App Store. Con
   cuenta gratuita la firma dura 7 días *y además* requiere Mac, así que no sirve.
   El Apple Developer Program cuesta **99 USD/año**.
3. **La web no está desplegada.** Cualquier app que no sea 100 % nativa carga la web
   desde una URL pública con HTTPS. Hoy el proyecto solo corre en `localhost`.

## Fases

| Fase | Entrega | Bloqueado por | Costo |
|---|---|---|---|
| 1 | App instalable desde Safari, pantalla completa, vistas móviles | — | $0 |
| 2 | Proyecto Capacitor (`ios/`) con plugins nativos | Fase 0 (despliegue) | $0 |
| 3 | Build en la nube → TestFlight | Cuenta Apple | 99 USD/año |
| 4 | Publicación en App Store | Fase 3 | incluido |

---

## Fase 0 — Desplegar la web (pendiente, prerequisito de la Fase 2)

La app iOS no puede empaquetar un Next.js con Server Components y rutas API: ese
código corre en un servidor. Hay que desplegar en Vercel (o equivalente) y cargar
las variables de `.env.local` como variables de entorno del proyecto.

Ojo con `AUTODESK_CALLBACK_URL`: hay que registrar el dominio nuevo en la consola de
APS o el visor deja de autenticar.

## Fase 1 — App instalable (hecho)

Implementado en este repo:

- `scripts/gen-app-icons.mjs` — genera `public/icons/icon-{180,192,512,1024}.png`
  sin dependencias. El de 1024 es el que pide la ficha de App Store.
- `src/app/manifest.ts` — manifiesto en `/manifest.webmanifest`.
- `src/app/layout.tsx` — meta `apple-mobile-web-app-*`, `viewport-fit=cover`,
  `theme-color`, ícono de 180 para iOS.
- `src/app/globals.css` — variables de área segura (notch y barra de gestos) y
  correcciones táctiles: sin rebote de scroll sobre el visor 3D, sin zoom automático
  al enfocar campos.
- `src/proxy.ts` — el manifiesto queda fuera del guard de sesión; si no, iOS recibe
  un redirect al login y no reconoce la app como instalable.

### Probarla hoy en el iPhone

Con el servidor de desarrollo corriendo en el PC y el iPhone en la misma red Wi-Fi,
abrir en Safari `http://<IP-del-PC>:3000` → Compartir → *Agregar a pantalla de
inicio*. Queda con ícono propio y sin barra del navegador.

Si no carga, es el Firewall de Windows bloqueando el puerto 3000 en redes privadas:
hay que permitir Node.js a mano (Configuración → Firewall de Windows Defender).

Limitación conocida: sobre `http://` (sin certificado) no se puede registrar un
service worker, así que **no hay caché offline** hasta que exista el despliegue con
HTTPS de la Fase 0.

## Modo tablet de terreno (sin pantalla de login)

Con `HILO_ACCESO_DIRECTO_EMAIL` puesta en el entorno, la app no muestra login: el
guard de sesión manda a `/auth/acceso-directo`, que emite un token de un solo uso con
la llave de servicio, lo canjea por una sesión y deja al usuario dentro. No hay
ninguna contraseña guardada en el proyecto.

**Cualquiera que abra la URL queda dentro con todos los permisos de esa cuenta.** Solo
para equipos de confianza en red cerrada. Para volver al login normal, basta con
borrar la variable. En producción debe ir vacía.

Detalle de implementación: las redirecciones de esa ruta son **relativas**, no
absolutas. `new URL(request.url).origin` devuelve `localhost` cuando el servidor se
alcanza por la IP de la red local, y en una tablet `localhost` es la tablet misma.

## Fase 2 — Envoltorio Capacitor

Genera la carpeta `ios/` con un proyecto Xcode real que carga la web desplegada
dentro de un `WKWebView`.

```bash
npm i -D @capacitor/cli && npm i @capacitor/core @capacitor/ios
npx cap init "Hilo Digital" cl.hilodigital.app --web-dir=public
npx cap add ios
```

En `capacitor.config.ts`, `server.url` apunta al dominio de la Fase 0.

**Esto por sí solo no pasa revisión de Apple.** La guideline 4.2 (*minimum
functionality*) rechaza apps que son solo una web envuelta. Hay que sumar funciones
nativas de verdad, que además son las que le dan sentido a la app en terreno:

- `@capacitor/camera` — fotos del reporte tomadas desde la app.
- `@capacitor/push-notifications` — avisos de restricciones y aprobaciones.
- `@capacitor/geolocation` — ubicación del reporte.
- `@capacitor/preferences` + caché — que abra y muestre algo sin señal.

## Fase 3 — TestFlight (el "modo desarrollador" que sirve)

1. Inscribirse en el Apple Developer Program (99 USD/año). Como persona natural es
   inmediato; como empresa exige número D‑U‑N‑S y demora semanas. Para EIMISA
   conviene decidir esto temprano, porque cambia el titular de la app.
2. En App Store Connect: crear la app con el bundle id `cl.hilodigital.app` y generar
   una **API Key** (Integraciones → Claves).
3. En Codemagic (tiene plan gratuito con minutos de macOS): conectar el repo de
   GitHub, cargar la API Key y activar la firma automática. Codemagic crea
   certificados y perfiles solo — no hace falta Mac en ningún momento.
4. El build sube el `.ipa` a TestFlight. Se instala en el iPhone con la app
   TestFlight, dura 90 días por build y admite hasta 10.000 probadores.

Este es el paso donde el equipo de EIMISA y CENIA pueden probar en obra antes de
publicar.

## Fase 4 — App Store

Además del build: ícono 1024 (ya generado), capturas de 6,7" y 13" (iPhone y iPad),
descripción, **política de privacidad publicada en una URL** (obligatoria porque hay
cuentas de usuario), el cuestionario de privacidad (declarar que se recogen correo,
fotos y ubicación) y el `PrivacyInfo.xcprivacy` de las librerías.

Si la app es de uso interno de EIMISA y no para público general, evaluar el **Apple
Business Manager / distribución personalizada**: evita la revisión pública y el
riesgo del 4.2.

## Riesgos técnicos

- **El visor BIM en iPhone tiene techo.** Forge/APS es WebGL y iOS mata los procesos
  que consumen mucha memoria; el modelo completo de Collahuasi no va a cargar en un
  iPhone. En iPad Pro rinde bastante mejor. Hay que cargar vistas acotadas por CWP y
  no el modelo entero.
- **Rechazo por guideline 4.2** si la app queda como mero contenedor. Se mitiga con
  las funciones nativas de la Fase 2.
- **Sesión de Supabase dentro del WebView**: las cookies persisten distinto que en
  Safari; hay que probar que la sesión sobreviva al cierre de la app.
