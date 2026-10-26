import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  csrfToken,
  decryptTokens,
  encryptTokens,
  equalToken,
  hashToken,
  randomToken,
} from './auth-crypto';
describe('auth secrets', () => {
  const key = randomBytes(32).toString('base64');
  it('encrypts with unique nonces and binds ciphertext to its user', () => {
    const secret = JSON.stringify({
      access_token: 'access',
      refresh_token: 'refresh',
    });
    const encrypted = encryptTokens(secret, 'user-a', key);
    expect(encrypted).not.toContain('refresh');
    expect(encryptTokens(secret, 'user-a', key)).not.toBe(encrypted);
    expect(decryptTokens(encrypted, 'user-a', key)).toBe(secret);
    expect(() => decryptTokens(encrypted, 'user-b', key)).toThrow();
    expect(() =>
      decryptTokens(encrypted, 'user-a', randomBytes(32).toString('base64')),
    ).toThrow();
  });
  it('rejects altered ciphertext', () => {
    const parts = encryptTokens('secret', 'user', key).split('.');
    const bytes = Buffer.from(parts[3], 'base64');
    bytes[0] ^= 1;
    parts[3] = bytes.toString('base64');
    expect(() => decryptTokens(parts.join('.'), 'user', key)).toThrow();
    expect(() => decryptTokens('invalid', 'user', key)).toThrow();
  });
  it('uses opaque random sessions, deterministic hashes, and distinct CSRF tokens', () => {
    const session = randomToken();
    expect(randomToken()).not.toBe(session);
    expect(hashToken(session)).toHaveLength(64);
    expect(hashToken(session)).not.toBe(session);
    expect(csrfToken(session)).not.toBe(session);
    expect(csrfToken(randomToken())).not.toBe(csrfToken(session));
    expect(equalToken(csrfToken(session), csrfToken(session))).toBe(true);
    expect(equalToken('a', 'aa')).toBe(false);
    expect(equalToken('a', 'b')).toBe(false);
  });
});
