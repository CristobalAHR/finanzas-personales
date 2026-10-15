/**
 * sw.js — service worker
 *
 * SUBE `CACHE` EN CADA DESPLIEGUE. Es lo único que fuerza a las sesiones
 * abiertas a tomar el código nuevo.
 *
 * Cachea SOLO assets estáticos del mismo origen. Nunca datos de Firestore:
 * de eso se encarga `persistentLocalCache` en db.js. Dos cachés peleando por
 * los mismos datos fue la causa de pérdidas de información en la app anterior.
 */

const CACHE = "finanzas-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./estilos.css",
  "./app.js",
  "./esquema.js",
  "./calculos.js",
  "./db.js",
  "./manifest.json",
  "./icono-192.png",
  "./icono-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll falla entero si un archivo falta; así un ícono ausente no
      // rompe la instalación completa.
      .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  if (e.request.method !== "GET") return;

  // Firebase, el CDN de gstatic y cualquier otro origen van directo a la red.
  if (url.origin !== self.location.origin) return;

  // El HTML va primero a la red, para que un despliegue nuevo se note al tiro.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
          return r;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html"))),
    );
    return;
  }

  // El resto de los assets: caché primero, red como respaldo.
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request)),
  );
});
