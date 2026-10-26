import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
export const randomToken = () => randomBytes(32).toString('hex');
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const csrfToken = (session: string) =>
  createHmac('sha256', session).update('lore-csrf-v1').digest('hex');
export function equalToken(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function encryptTokens(
  plaintext: string,
  userId: string,
  key: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}
export function decryptTokens(
  encrypted: string,
  userId: string,
  key: string,
): string {
  const [version, iv, tag, data] = encrypted.split('.');
  if (version !== 'v1' || !iv || !tag || !data)
    throw new Error('Invalid token envelope');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'base64'),
    Buffer.from(iv, 'base64'),
  );
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
