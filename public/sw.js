/* VitalCowork — Service Worker: shell offline + notificaciones push */

const CACHE = "vitalcowork-v1";
const SHELL = ["/inicio", "/calendario", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Estrategia: red primero, caché como respaldo (solo GET de navegación)
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copia));
          return res;
        })
        .catch(() => caches.match(request).then((c) => c ?? caches.match("/inicio")))
    );
  }
});

// Notificaciones push
self.addEventListener("push", (event) => {
  let datos = { title: "VitalCowork", body: "", url: "/inicio" };
  try {
    datos = { ...datos, ...event.data.json() };
  } catch {
    datos.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(datos.title, {
      body: datos.body,
      icon: "/iconos/icono-192.png",
      badge: "/iconos/icono-192.png",
      data: { url: datos.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/inicio";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if ("focus" in cliente) {
          cliente.navigate(url);
          return cliente.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
