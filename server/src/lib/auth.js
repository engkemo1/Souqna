import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { q } from '../db/index.js';
import { AppError } from './errors.js';

export const signToken = (user) => jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '30d' });

export function requireOwner(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new AppError(401, 'unauthorized', 'Please sign in to continue.'));
  try {
    const { sub } = jwt.verify(token, config.jwtSecret);
    const user = q.get('SELECT id, name, email, role FROM users WHERE id=?', [sub]);
    if (!user) throw new Error('no user');
    if (user.role === 'disabled') return next(new AppError(403, 'account_disabled', 'This account is disabled. Contact Banha Outfit.'));
    if (user.role === 'demo' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.path !== '/store/theme/preview') {
      return next(new AppError(403, 'demo_readonly', 'This is a demo store — changes are disabled.'));
    }
    const store = q.get('SELECT * FROM stores WHERE owner_id=? ORDER BY id LIMIT 1', [user.id]);
    if (!store) return next(new AppError(403, 'no_store', 'No store is linked to this account.'));
    req.user = user;
    req.store = store;
    next();
  } catch {
    next(new AppError(401, 'session_expired', 'Your session has expired. Please sign in again.'));
  }
}
