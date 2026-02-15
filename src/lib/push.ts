const vapidPublicKeyApiPath = "/api/v1/push/vapid-public-key";
const subscriptionApiPath = "/api/v1/push/subscriptions";
const pushDeviceIdStorageKey = "push_device_id";

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

type ApiErrorResponse = {
  status?: {
    code?: string;
    message?: string;
    remark?: string;
  };
};

const getOrCreateDeviceId = () => {
  if (typeof window === "undefined") {
    throw new Error("Window is not available.");
  }

  const existing = window.localStorage.getItem(pushDeviceIdStorageKey);
  if (existing) {
    return existing;
  }

  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  window.localStorage.setItem(pushDeviceIdStorageKey, next);
  return next;
};

type PushSubscriptionPayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

const toPushSubscriptionPayload = (
  subscription: PushSubscription
): PushSubscriptionPayload => {
  const raw = subscription.toJSON();
  const endpoint = raw.endpoint;
  const p256dh = raw.keys?.p256dh;
  const auth = raw.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new Error("Subscription payload is incomplete.");
  }

  return {
    endpoint,
    keys: {
      p256dh,
      auth,
    },
  };
};

const parseApiErrorMessage = async (response: Response) => {
  const payload = (await response.json().catch(() => ({}))) as ApiErrorResponse;
  const code = payload.status?.code;
  const message = payload.status?.message;
  const remark = payload.status?.remark;

  if (remark) {
    return remark;
  }
  if (message && code) {
    return `${message} (code: ${code})`;
  }
  if (message) {
    return message;
  }
  return "Request failed.";
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
    const errorPayload = payload as unknown as ApiErrorResponse;
    const code = errorPayload.status?.code;
    const message = errorPayload.status?.message;
    const remark = errorPayload.status?.remark;
    throw new Error(
      remark || (message && code ? `${message} (code: ${code})` : message || "Request failed.")
    );
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

export const hasPushSubscription = async () => {
  if (!isPushSupported()) {
    return false;
  }
  const registration = await registerServiceWorker();
  if (!registration) {
    return false;
  }
  const subscription = await registration.pushManager.getSubscription();
  return Boolean(subscription);
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
  const deviceId = getOrCreateDeviceId();

  const response = await fetch(subscriptionApiPath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...createAuthHeaders(),
    },
    body: JSON.stringify({
      device_id: deviceId,
      subscription: toPushSubscriptionPayload(subscription),
      userAgent: navigator.userAgent,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response));
  }

  return subscription;
};

export const unsubscribeFromPushNotifications = async () => {
  if (!isPushSupported()) {
    throw new Error("This browser does not support push notifications.");
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    throw new Error("Failed to register service worker.");
  }

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return;
  }

  const deviceId = getOrCreateDeviceId();
  const unsubscribed = await subscription.unsubscribe();
  if (!unsubscribed) {
    throw new Error("Failed to unsubscribe from push notifications.");
  }

  const response = await fetch(subscriptionApiPath, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...createAuthHeaders(),
    },
    body: JSON.stringify({
      device_id: deviceId,
      endpoint: subscription.endpoint,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response));
  }
};
