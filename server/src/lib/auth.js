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
    const store = q.get('SELECT * FROM stores WHERE owner_id=? ORDER BY id LIMIT 1', [user.id]);
    if (!store) return next(new AppError(403, 'no_store', 'No store is linked to this account.'));
    req.user = user;
    req.store = store;
    next();
  } catch {
    next(new AppError(401, 'session_expired', 'Your session has expired. Please sign in again.'));
  }
}
