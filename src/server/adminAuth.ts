import crypto from 'node:crypto';

export interface AdminPrincipal {
  username: string;
  name: string;
  nik: string;
  role: 'hrd';
}

interface StoredCredential {
  username: string;
  salt: string;
  hashHex: string;
}

interface TokenRecord {
  jti: string;
  username: string;
  exp: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Pre-derived salted scrypt digest for initial preview admin onboarding.
// Automatically overridden whenever process.env.ADMIN_PASSWORD is set or rotated via changePassword().
const INITIAL_CREDENTIAL: StoredCredential = {
  username: 'admin',
  salt: 'fd7920acd439dce0be78840a4d870bfc',
  hashHex:
    '32b3aa94b02be8d07c7ef2ccb582ad818818037b2bcad109f72e55146daeebf27ebd83ca4bd09af98de9eda4ab686d79f5a001582c453c16168f2fd4c6b3684d',
};

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_MAX_ATTEMPTS = 25;

function hashWithSalt(password: string, salt: string): Buffer {
  return crypto.scryptSync(password, salt, 64);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Compare against dummy buffer to avoid early-return timing leak
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createAdminAuthService(env: NodeJS.ProcessEnv = process.env) {
  const signingSecret: Buffer = env.ADMIN_SESSION_SECRET?.trim()
    ? Buffer.from(env.ADMIN_SESSION_SECRET.trim(), 'utf8')
    : crypto.randomBytes(32);

  let runtimeCredential: StoredCredential = { ...INITIAL_CREDENTIAL };
  const activeTokens = new Map<string, TokenRecord>();
  const loginAttempts = new Map<string, RateLimitEntry>();

  const hasEnvOverride = (): boolean => Boolean(env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length > 0);

  const getConfiguredUsername = (): string => {
    const envUser = env.ADMIN_USERNAME?.trim();
    return envUser && envUser.length > 0 ? envUser : runtimeCredential.username;
  };

  const checkRateLimit = (ipKey: string): { allowed: boolean; retryAfterSec?: number } => {
    const now = Date.now();
    const existing = loginAttempts.get(ipKey);
    if (!existing || now > existing.resetAt) {
      loginAttempts.set(ipKey, { count: 1, resetAt: now + RATE_WINDOW_MS });
      return { allowed: true };
    }
    if (existing.count >= RATE_MAX_ATTEMPTS) {
      return { allowed: false, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) };
    }
    existing.count += 1;
    return { allowed: true };
  };

  const resetRateLimit = (ipKey: string): void => {
    loginAttempts.delete(ipKey);
  };

  const verifyPasswordOnly = (password: string): boolean => {
    if (hasEnvOverride()) {
      return timingSafeStringEqual(password, env.ADMIN_PASSWORD ?? '');
    }
    const derived = hashWithSalt(password, runtimeCredential.salt);
    const expected = Buffer.from(runtimeCredential.hashHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  };

  const verifyCredentials = (username: unknown, password: unknown): boolean => {
    if (typeof username !== 'string' || typeof password !== 'string') return false;
    const cleanUser = username.trim().toLowerCase();
    if (cleanUser.length < 1 || cleanUser.length > 64) return false;
    if (password.length < 1 || password.length > 128) return false;

    const expectedUser = getConfiguredUsername().toLowerCase();
    const userMatches = timingSafeStringEqual(cleanUser, expectedUser);
    const passMatches = verifyPasswordOnly(password);
    return userMatches && passMatches;
  };

  const signToken = (payloadB64: string): string => {
    return crypto.createHmac('sha256', signingSecret).update(payloadB64).digest('base64url');
  };

  const issueToken = (username: string): { token: string; expiresAt: number; admin: AdminPrincipal } => {
    const jti = crypto.randomBytes(16).toString('hex');
    const exp = Date.now() + TOKEN_TTL_MS;
    const cleanUser = username.trim().toLowerCase();
    const payload = {
      sub: cleanUser,
      role: 'hrd',
      jti,
      exp,
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = signToken(payloadB64);
    activeTokens.set(jti, { jti, username: cleanUser, exp });

    return {
      token: `${payloadB64}.${sig}`,
      expiresAt: exp,
      admin: {
        username: cleanUser,
        name: 'Administrator SBM',
        nik: 'ADMIN01',
        role: 'hrd',
      },
    };
  };

  const verifyToken = (token: string | undefined | null): { valid: true; admin: AdminPrincipal; jti: string } | { valid: false } => {
    if (!token || typeof token !== 'string') return { valid: false };
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false };
    const [payloadB64, sig] = parts;
    const expectedSig = signToken(payloadB64);
    if (!timingSafeStringEqual(sig, expectedSig)) return { valid: false };

    try {
      const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
        sub?: string;
        jti?: string;
        exp?: number;
      };
      if (!parsed.jti || !parsed.sub || typeof parsed.exp !== 'number') return { valid: false };
      if (Date.now() > parsed.exp) {
        activeTokens.delete(parsed.jti);
        return { valid: false };
      }
      const tracked = activeTokens.get(parsed.jti);
      if (!tracked || tracked.username !== parsed.sub) return { valid: false };

      return {
        valid: true,
        jti: parsed.jti,
        admin: {
          username: tracked.username,
          name: 'Administrator SBM',
          nik: 'ADMIN01',
          role: 'hrd',
        },
      };
    } catch {
      return { valid: false };
    }
  };

  const revokeToken = (token: string | undefined | null): void => {
    const res = verifyToken(token);
    if (res.valid) {
      activeTokens.delete(res.jti);
    }
  };

  const changePassword = (
    token: string | undefined | null,
    currentPassword: unknown,
    newPassword: unknown
  ): { ok: true; token: string } | { ok: false; status: number; error: string } => {
    const session = verifyToken(token);
    if (!session.valid) {
      return { ok: false, status: 401, error: 'Sesi admin tidak valid atau sudah berakhir.' };
    }
    if (hasEnvOverride()) {
      return {
        ok: false,
        status: 400,
        error: 'Kata sandi admin dikunci oleh environment variable ADMIN_PASSWORD. Ubah melalui panel Secrets.',
      };
    }
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return { ok: false, status: 400, error: 'Format kata sandi tidak valid.' };
    }
    if (!verifyPasswordOnly(currentPassword)) {
      return { ok: false, status: 403, error: 'Kata sandi saat ini tidak sesuai.' };
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      return { ok: false, status: 400, error: 'Kata sandi admin baru minimal 6 karakter.' };
    }

    const nextSalt = crypto.randomBytes(16).toString('hex');
    const nextHash = hashWithSalt(newPassword, nextSalt).toString('hex');
    runtimeCredential = {
      username: runtimeCredential.username,
      salt: nextSalt,
      hashHex: nextHash,
    };

    // Revoke all old tokens and issue a fresh token for the active admin
    activeTokens.clear();
    const fresh = issueToken(session.admin.username);
    return { ok: true, token: fresh.token };
  };

  return {
    checkRateLimit,
    resetRateLimit,
    verifyCredentials,
    issueToken,
    verifyToken,
    revokeToken,
    changePassword,
  };
}
