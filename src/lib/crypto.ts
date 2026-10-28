import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
function key() {
  const value = process.env.ENCRYPTION_KEY;
  if (!value || !/^[a-f\d]{64}$/i.test(value))
    throw new Error('ENCRYPTION_KEY должен содержать 64 hex-символа');
  return Buffer.from(value, 'hex');
}
export function encrypt(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((v) => v.toString('base64url')).join('.');
}
export function decrypt(value: string) {
  const [iv, tag, data] = value.split('.').map((v) => Buffer.from(v, 'base64url'));
  if (!iv || !tag || !data) throw new Error('Повреждённый секрет');
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
export const randomToken = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
// A stored credential belongs to one destination and must not follow a host/provider change.
export function updatedSecret(
  value: string | undefined,
  sameDestination: boolean,
): string | null | undefined {
  return value ? encrypt(value) : sameDestination ? undefined : null;
}
