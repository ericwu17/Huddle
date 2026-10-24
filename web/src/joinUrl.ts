// Links people scan or tap to join. NEXT_PUBLIC_APP_URL pins them to the stable
// production domain, so a QR shown on a preview deployment still works later.
const configured = (import.meta.env.NEXT_PUBLIC_APP_URL as string | undefined)?.trim().replace(/\/+$/, "");

export function joinUrl(code: string) {
  return `${configured || window.location.origin}/join/${code}`;
}
