import type { KeyPairSerialized, EncryptedCluePayload } from "../game/types";

/**
 * Hybrid encryption — RSA-OAEP (2048-bit) + AES-GCM (256-bit)
 *
 * Scheme:
 *   1. Generate a random 256-bit AES-GCM key.
 *   2. Encrypt the plaintext JSON payload with AES-GCM.
 *   3. Encrypt the AES key with the recipient's RSA-OAEP public key.
 *   4. Package {iv, encryptedKey, ciphertext} as a base64-encoded JSON string.
 *
 * Anti-brute-force guarantee:
 *   The plaintext is always a rich EncryptedCluePayload object containing
 *   a random nonce, timestamps, and contextual fields — so even if the
 *   attacker guesses the card name, the ciphertext cannot be verified.
 *
 * All operations use the browser Web Crypto API (SubtleCrypto).
 */

// ============================================================
// KEY GENERATION
// ============================================================

/** Generates a new RSA-OAEP 2048-bit key pair, serialised as JWK strings. */
export async function generateKeyPair(): Promise<KeyPairSerialized> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true, // exportable
    ["encrypt", "decrypt"]
  );

  const [pub, priv] = await Promise.all([
    crypto.subtle.exportKey("jwk", pair.publicKey),
    crypto.subtle.exportKey("jwk", pair.privateKey),
  ]);

  return {
    publicKey:  JSON.stringify(pub),
    privateKey: JSON.stringify(priv),
  };
}

// ============================================================
// ENCRYPTION
// ============================================================

interface CipherBundle {
  iv: string;           // Base64 AES-GCM IV
  encryptedKey: string; // Base64 RSA-OAEP-encrypted AES key
  ciphertext: string;   // Base64 AES-GCM ciphertext
}

/**
 * Encrypts a payload object for a specific recipient.
 *
 * @param payload     Any serialisable object (typically EncryptedCluePayload)
 * @param publicKeyJwk JWK-serialised RSA-OAEP public key of the recipient
 * @returns Base64-encoded JSON string containing the full cipher bundle
 */
export async function encryptPayload(
  payload: object,
  publicKeyJwk: string
): Promise<string> {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(payload));

  // 1. Import recipient's RSA public key
  const rsaPublicKey = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(publicKeyJwk),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );

  // 2. Generate ephemeral AES-GCM session key
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  // 3. Generate random IV for AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // 4. Encrypt the plaintext with AES-GCM
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plaintext
  );

  // 5. Wrap the AES key with the recipient's RSA public key
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
  const encryptedKeyBuf = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    rsaPublicKey,
    rawAesKey
  );

  // 6. Package everything into a single base64-encoded JSON string
  const bundle: CipherBundle = {
    iv:           toBase64(iv),
    encryptedKey: toBase64(new Uint8Array(encryptedKeyBuf)),
    ciphertext:   toBase64(new Uint8Array(ciphertextBuf)),
  };

  return btoa(JSON.stringify(bundle));
}

// ============================================================
// DECRYPTION
// ============================================================

/**
 * Decrypts a bundle produced by {@link encryptPayload}.
 *
 * @param cipherBundle  Base64-encoded JSON string (CipherBundle)
 * @param privateKeyJwk JWK-serialised RSA-OAEP private key of the recipient
 * @returns The original payload object
 */
export async function decryptPayload<T = object>(
  cipherBundle: string,
  privateKeyJwk: string
): Promise<T> {
  const bundle: CipherBundle = JSON.parse(atob(cipherBundle));

  // 1. Import recipient's RSA private key
  const rsaPrivateKey = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(privateKeyJwk),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"]
  );

  // 2. Unwrap the AES key
  const rawAesKey = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    rsaPrivateKey,
    fromBase64(bundle.encryptedKey) as any
  );

  // 3. Import the AES key
  const aesKey = await crypto.subtle.importKey(
    "raw",
    rawAesKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  // 4. Decrypt the ciphertext
  const plaintextBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(bundle.iv) as any },
    aesKey,
    fromBase64(bundle.ciphertext) as any
  );

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(plaintextBuf)) as T;
}

// ============================================================
// CLUE PAYLOAD FACTORY
// ============================================================

/**
 * Constructs the anti-brute-force payload wrapping a single card reveal.
 * Must be encrypted with {@link encryptPayload} before storage.
 */
export function buildCluePayload(
  fields: Omit<EncryptedCluePayload, "timestamp" | "nonce">
): EncryptedCluePayload {
  return {
    ...fields,
    timestamp: new Date().toISOString(),
    nonce:     crypto.getRandomValues(new Uint8Array(16))
                     .reduce((s, b) => s + b.toString(16).padStart(2, "0"), ""),
  };
}

// ============================================================
// INTERNAL UTILITIES
// ============================================================

function toBase64(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf));
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
