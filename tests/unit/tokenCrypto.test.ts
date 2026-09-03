import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "@/lib/calendar-sync/tokenCrypto";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");

describe("tokenCrypto", () => {
  it("round-trips a token through encrypt then decrypt", async () => {
    const encrypted = await encryptToken("super-secret-refresh-token", TEST_KEY);
    const decrypted = await decryptToken(encrypted, TEST_KEY);
    expect(decrypted).toBe("super-secret-refresh-token");
  });

  it("produces different ciphertext for the same plaintext each time (random IV)", async () => {
    const a = await encryptToken("same-value", TEST_KEY);
    const b = await encryptToken("same-value", TEST_KEY);
    expect(a).not.toBe(b);
  });

  it("fails to decrypt with the wrong key", async () => {
    const encrypted = await encryptToken("secret", TEST_KEY);
    await expect(decryptToken(encrypted, OTHER_KEY)).rejects.toThrow();
  });
});
