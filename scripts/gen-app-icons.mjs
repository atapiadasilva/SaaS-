/**
 * Genera los íconos de la app (PWA + iOS + App Store) sin dependencias externas.
 *
 *   node scripts/gen-app-icons.mjs
 *
 * Escribe PNG opacos en public/icons/. Apple exige el ícono de App Store en 1024
 * sin transparencia y sin esquinas redondeadas (la máscara la aplica el sistema),
 * así que todos se generan a sangre completa.
 *
 * La marca es el "hilo digital": tres nodos unidos por una hebra en diagonal.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROJO   = [0xff, 0x00, 0x00];
const BLANCO = [0xff, 0xff, 0xff];

/** Supersampling: se rasteriza a 4x y se promedia, que es todo el antialiasing que necesitamos. */
const SS = 4;

const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** Codifica RGB de 8 bits sin canal alfa (color type 2). */
function png(ancho, alto, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: truecolor
  // 10..12 = compresión, filtro, entrelazado — todos 0

  const filas = Buffer.alloc(alto * (1 + ancho * 3));
  for (let y = 0; y < alto; y++) {
    const destino = y * (1 + ancho * 3);
    filas[destino] = 0; // filtro None
    rgb.copy(filas, destino + 1, y * ancho * 3, (y + 1) * ancho * 3);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(filas, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Distancia de un punto al segmento a→b, para dibujar la hebra con grosor. */
function distanciaASegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const largo2 = dx * dx + dy * dy;
  let t = largo2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / largo2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function dibujar(lado) {
  const n = lado * SS;
  // Coordenadas relativas al lado: la hebra sube de abajo-izquierda a arriba-derecha.
  const nodos = [
    [0.24, 0.76],
    [0.50, 0.50],
    [0.76, 0.24],
  ].map(([x, y]) => [x * n, y * n]);
  const radioNodo = 0.088 * n;
  const grosorHebra = 0.052 * n / 2;

  const grande = Buffer.alloc(n * n * 3);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      let blanco = distanciaASegmento(px, py, nodos[0][0], nodos[0][1], nodos[2][0], nodos[2][1]) <= grosorHebra;
      if (!blanco) {
        for (const [nx, ny] of nodos) {
          if (Math.hypot(px - nx, py - ny) <= radioNodo) { blanco = true; break; }
        }
      }

      const color = blanco ? BLANCO : ROJO;
      const i = (y * n + x) * 3;
      grande[i] = color[0];
      grande[i + 1] = color[1];
      grande[i + 2] = color[2];
    }
  }

  // Promedio de cada bloque SS×SS → antialiasing.
  const salida = Buffer.alloc(lado * lado * 3);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * n + (x * SS + sx)) * 3;
          r += grande[i]; g += grande[i + 1]; b += grande[i + 2];
        }
      }
      const total = SS * SS;
      const i = (y * lado + x) * 3;
      salida[i] = Math.round(r / total);
      salida[i + 1] = Math.round(g / total);
      salida[i + 2] = Math.round(b / total);
    }
  }
  return png(lado, lado, salida);
}

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'public', 'icons');
mkdirSync(destino, { recursive: true });

// 180 = apple-touch-icon · 192/512 = manifest PWA · 1024 = ficha de App Store
for (const lado of [180, 192, 512, 1024]) {
  const archivo = join(destino, `icon-${lado}.png`);
  writeFileSync(archivo, dibujar(lado));
  console.log(`  ✓ public/icons/icon-${lado}.png`);
}
