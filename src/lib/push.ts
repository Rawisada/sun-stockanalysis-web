const vapidPublicKeyApiPath = "/api/v1/push/vapid-public-key";
const subscriptionApiPath = "/api/v1/push/subscriptions";

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

const isPushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const getAccessToken = () => {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(/(?:^|; )access_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const createCorrelationId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const createAuthHeaders = () => {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error("Missing access token. Please login again.");
  }
  return {
    Authorization: `Bearer ${accessToken}`,
    "X-Correlation-Id": createCorrelationId(),
  };
};

type VapidPublicKeyResponse = {
  public_key?: string;
  vapid_public_key?: string;
  data?: {
    public_key?: string;
    vapid_public_key?: string;
  };
};

const getVapidPublicKey = async () => {
  const response = await fetch(vapidPublicKeyApiPath, {
    method: "GET",
    headers: {
      ...createAuthHeaders(),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as VapidPublicKeyResponse;
  if (!response.ok) {
    throw new Error("Failed to load VAPID public key from backend.");
  }

  const key =
    payload.data?.public_key ??
    payload.data?.vapid_public_key ??
    payload.public_key ??
    payload.vapid_public_key;

  if (!key) {
    throw new Error("Backend response does not include VAPID public key.");
  }

  return key;
};

export const registerServiceWorker = async () => {
  if (!isPushSupported()) {
    return null;
  }
  return navigator.serviceWorker.register("/sw.js");
};

export const subscribeToPushNotifications = async () => {
  if (!isPushSupported()) {
    throw new Error("This browser does not support push notifications.");
  }

  const vapidPublicKey = await getVapidPublicKey();

  const registration = await registerServiceWorker();
  if (!registration) {
    throw new Error("Failed to register service worker.");
  }

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;

  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const response = await fetch(subscriptionApiPath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...createAuthHeaders(),
    },
    body: JSON.stringify({
      subscription,
      userAgent: navigator.userAgent,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Failed to save subscription.");
  }

  return subscription;
};
