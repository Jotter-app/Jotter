// AES-256-GCM via the Web Crypto API (`crypto.subtle`), which is available
// natively in both this app's Node/Next.js server runtime and the Deno-based
// sync-calendars Edge Function -- letting both runtimes carry the exact same
// encrypt/decrypt logic (supabase/functions/sync-calendars/tokenCrypto.ts is
// a byte-for-byte copy of this file) instead of two divergent
// implementations tied to Node's own `crypto` module, which Deno doesn't
// share. Base64 (de)serialization goes through btoa/atob rather than
// Node's Buffer for the same cross-runtime reason.
const ALGORITHM = "AES-GCM";
const IV_BYTES = 12;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function importKey(base64Key: string): Promise<CryptoKey> {
  // Cast needed for TS's lib.dom.d.ts BufferSource typing, which as of the
  // TS version this project pins wants an ArrayBuffer-backed view
  // specifically -- Uint8Array's own type is backed by the broader
  // ArrayBufferLike, so a plain Uint8Array doesn't structurally match even
  // though it's a valid BufferSource at runtime.
  return crypto.subtle.importKey("raw", base64ToBytes(base64Key) as BufferSource, ALGORITHM, false, [
    "encrypt",
    "decrypt",
  ]);
}

// Packs the random IV ahead of the ciphertext into one base64 string, so
// decryptToken only needs the single stored value -- no separate IV column.
export async function encryptToken(plaintext: string, base64Key: string): Promise<string> {
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, new TextEncoder().encode(plaintext))
  );

  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return bytesToBase64(combined);
}

export async function decryptToken(encoded: string, base64Key: string): Promise<string> {
  const key = await importKey(base64Key);
  const combined = base64ToBytes(encoded);
  const iv = combined.slice(0, IV_BYTES);
  const ciphertext = combined.slice(IV_BYTES);

  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
