/**
 * Set (or randomise) a store owner's password.
 *   npm run set-password -w server -- townstyle@banhalook.app            # random password, printed once
 *   npm run set-password -w server -- townstyle@banhalook.app "MyNewPass#1"
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { q } from '../db/index.js';
const [email, given] = process.argv.slice(2);
if (!email) { console.error('usage: set-password <email> [password]'); process.exit(1); }
const pw = given || crypto.randomBytes(9).toString('base64url');
if (pw.length < 8) { console.error('password must be at least 8 characters'); process.exit(1); }
const u = q.get('SELECT id FROM users WHERE LOWER(email)=LOWER(?)', [email]);
if (!u) { console.error('no such user'); process.exit(1); }
q.run('UPDATE users SET password_hash=? WHERE id=?', [bcrypt.hashSync(pw, 10), u.id]);
console.log(`Password updated for ${email}${given ? '' : `\nNew password: ${pw}`}`);
