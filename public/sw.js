/**
 * MAIAChat Service Worker
 *
 * Provides PWA capabilities:
 * - Offline support for cached pages
 * - Background sync for notifications
 * - Push notification support
 */

const CACHE_NAME = "maiachat-v2-cache-v1";
const STATIC_ASSETS = [
    "/",
    "/chat",
    "/manifest.json",
];

// Install: cache static assets
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch: network-first with cache fallback
self.addEventListener("fetch", (event) => {
    const { request } = event;

    // Skip non-GET requests
    if (request.method !== "GET") return;

    // Skip API requests and auth routes
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
        return;
    }

    event.respondWith(
        fetch(request)
            .then((response) => {
                // Cache successful responses
                if (response.ok && response.type === "basic") {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fall back to cache
                return caches.match(request).then((cached) => {
                    return cached || new Response("Offline", { status: 503 });
                });
            })
    );
});

// Push notification handler
self.addEventListener("push", (event) => {
    if (!event.data) return;

    const data = event.data.json();

    event.waitUntil(
        self.registration.showNotification(data.title || "MAIAChat", {
            body: data.body || "",
            icon: "/icon-192.svg",
            badge: "/icon-192.svg",
            data: { url: data.url || "/chat" },
            tag: data.tag || "maiachat-notification",
        })
    );
});

// Notification click handler
self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    const url = event.notification.data?.url || "/chat";

    event.waitUntil(
        self.clients.matchAll({ type: "window" }).then((clients) => {
            // Focus existing window if available
            for (const client of clients) {
                if (client.url.includes(url) && "focus" in client) {
                    return client.focus();
                }
            }
            // Open new window
            return self.clients.openWindow(url);
        })
    );
});
