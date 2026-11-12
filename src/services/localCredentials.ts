/** Password verification only: this does NOT encrypt health data or protect a compromised browser. */
export interface LocalCredential {
  algorithm: 'PBKDF2-SHA256';
  iterations: number;
  saltHex: string;
  hashHex: string;
}
const ITERATIONS = 600_000;
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
function subtle(): SubtleCrypto {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Se requiere HTTPS y Web Crypto para acceder al modo local.');
  }
  return crypto.subtle;
}
async function derive(password: string, saltHex: string, iterations: number): Promise<string> {
  const api = subtle();
  const key = await api.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const salt = Uint8Array.from(saltHex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
  return hex(
    new Uint8Array(
      await api.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256),
    ),
  );
}
function equalHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
export async function createLocalCredential(password: string): Promise<LocalCredential> {
  subtle();
  const saltHex = hex(crypto.getRandomValues(new Uint8Array(16)));
  return {
    algorithm: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    saltHex,
    hashHex: await derive(password, saltHex, ITERATIONS),
  };
}
export async function verifyLocalCredential(
  password: string,
  credential: LocalCredential,
): Promise<boolean> {
  if (
    credential.algorithm !== 'PBKDF2-SHA256' ||
    credential.iterations !== ITERATIONS ||
    !/^[a-f0-9]{32}$/i.test(credential.saltHex) ||
    !/^[a-f0-9]{64}$/i.test(credential.hashHex)
  )
    return false;
  return equalHex(
    await derive(password, credential.saltHex, credential.iterations),
    credential.hashHex,
  );
}
/** One-way upgrade after a valid legacy password. The old non-cryptographic fallback is never accepted. */
export async function verifyLegacyCredential(
  email: string,
  password: string,
  storedHash: string,
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/i.test(storedHash)) return false;
  const payload = `${email.trim().toLowerCase()}::fitnutricion-salt-v1::${password}`;
  return equalHex(
    hex(new Uint8Array(await subtle().digest('SHA-256', new TextEncoder().encode(payload)))),
    storedHash,
  );
}
