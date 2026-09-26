// SHA-256 hashing for admin password / member PIN comparison.
// Note: this is a client-only SPA with no auth backend, so this raises the bar
// against casual guessing/UI bypass but is not equivalent to server-verified auth.
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Default PIN for members who haven't been assigned an explicit one yet:
// last 4 digits of their phone number, or last 4 digits of their Member ID as a fallback.
export function deriveFallbackPin(memberId: string, phone?: string): string {
  const digitsOnly = (s: string) => s.replace(/\D/g, '');
  const phoneDigits = phone ? digitsOnly(phone) : '';
  if (phoneDigits.length >= 4) {
    return phoneDigits.slice(-4);
  }
  return digitsOnly(memberId).slice(-4).padStart(4, '0');
}
