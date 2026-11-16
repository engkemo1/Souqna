import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { q } from '../db/index.js';
import { AppError } from './errors.js';

export const BCRYPT_COST = () => Number(config.bcryptRounds || 12);

export async function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_COST());
}

export async function verifyPassword(plain, hash) {
  if (!plain || !hash) return { valid: false, needsRehash: false, matched: '' };
  const raw = String(plain);
  let valid = await bcrypt.compare(raw, hash);
  let matched = raw;
  if (!valid && raw.trim() !== raw && raw.trim().length > 0) {
    valid = await bcrypt.compare(raw.trim(), hash);
    if (valid) matched = raw.trim();
  }
  if (!valid) return { valid: false, needsRehash: false, matched: '' };
  let rounds = 10;
  try {
    rounds = bcrypt.getRounds(hash);
  } catch {
    rounds = 10;
  }
  return { valid: true, needsRehash: rounds < BCRYPT_COST(), matched };
}

export function readCookie(req, name) {
  const raw = req?.headers?.cookie;
  if (!raw || typeof raw !== 'string') return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return part.slice(idx + 1).trim();
      }
    }
  }
  return null;
}

export function setAuthCookie(res, token, { name = 'twist_owner_token', maxAgeSec = 3600 } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/api',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (config.env === 'production') parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export function clearAuthCookie(res, name = 'twist_owner_token') {
  const parts = [`${name}=`, 'HttpOnly', 'Path=/api', 'SameSite=Lax', 'Max-Age=0'];
  if (config.env === 'production') parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export const signToken = (user, { expiresIn } = {}) => {
  const tv = user?.token_version ?? (user?.id ? q.val('SELECT token_version FROM users WHERE id=?', [user.id]) : 1) ?? 1;
  return jwt.sign({ sub: user.id, tv: Number(tv) }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: expiresIn || config.jwtExpiresIn || '1h',
  });
};

export function revokeUserSessions(userId) {
  q.run('UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id=?', [userId]);
}

export function requireOwner(req, _res, next) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const token = bearer || readCookie(req, 'twist_owner_token');
  if (!token) return next(new AppError(401, 'unauthorized', 'Please sign in to continue.'));
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    const user = q.get('SELECT id, name, email, role, token_version, must_change_password FROM users WHERE id=?', [payload.sub]);
    if (!user) throw new Error('no user');
    const expectedTv = Number(user.token_version ?? 1);
    if (payload.tv !== undefined && Number(payload.tv) !== expectedTv) {
      throw new Error('token revoked');
    }
    if (user.role === 'disabled') return next(new AppError(403, 'account_disabled', 'This account is disabled. Contact Twist.'));
    if (user.role === 'demo' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.path !== '/store/theme/preview') {
      return next(new AppError(403, 'demo_readonly', 'This is a demo store — changes are disabled.'));
    }
    if (user.must_change_password && req.baseUrl === '/api/owner' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next(new AppError(403, 'password_change_required', 'Please change your temporary password before making changes.'));
    }
    const store = q.get('SELECT * FROM stores WHERE owner_id=? ORDER BY id LIMIT 1', [user.id]);
    if (!store) return next(new AppError(403, 'no_store', 'No store is linked to this account.'));
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: !!user.must_change_password,
    };
    req.store = store;
    next();
  } catch {
    next(new AppError(401, 'session_expired', 'Your session has expired. Please sign in again.'));
  }
}
