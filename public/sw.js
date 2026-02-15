self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "Sun Stock Alert",
      body: event.data ? event.data.text() : "You have a new alert.",
    };
  }

  const isPopupType = payload && payload.type === "popup";
  if (!isPopupType) {
    return;
  }

  const symbol =
    payload && payload.event && typeof payload.event.symbol === "string"
      ? payload.event.symbol
      : "UNKNOWN";
  const message =
    payload && typeof payload.message === "string"
      ? payload.message
      : "You have a new alert.";
  const scoreEma =
    payload &&
    payload.event &&
    typeof payload.event.score_ema === "number"
      ? payload.event.score_ema
      : null;

  const title = payload.title || "Stock Alert";
  const scoreText = scoreEma == null ? "-" : String(scoreEma);
  const body = `[${symbol}] ${message} (score_ema: ${scoreText})`;
  const targetUrl =
    payload && payload.event && payload.event.symbol
      ? `/detail/daily/${payload.event.symbol}`
      : "/";

  const options = {
    body,
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/icon-32.png",
    tag: payload && payload.event && payload.event.id ? payload.event.id : undefined,
    renotify: true,
    data: {
      url: payload.url || targetUrl,
      event: payload.event || null,
      message,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification && event.notification.data && event.notification.data.url) ||
    "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
