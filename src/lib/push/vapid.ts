// Chave pública VAPID — publishable, pode estar no bundle do cliente.
// A privada (VAPID_PRIVATE_KEY) é secret de servidor.
export const VAPID_PUBLIC_KEY =
  "BLq4iOTPtY6ZOr_HyH-mv5KB9nttpHi0ewqR1jyrMnwWdeyFK2POYMf3qBzN6f3eAdNeT0hSCn-Gy0rc7ZwqqlY";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
