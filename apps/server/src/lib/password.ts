import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// scrypt is built into Node — no native deps, no extra library. Format: scrypt$salt$key.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const key = Buffer.from(keyHex, "hex");
  const test = (await scryptAsync(password, Buffer.from(saltHex, "hex"), 64)) as Buffer;
  return key.length === test.length && timingSafeEqual(key, test);
}
