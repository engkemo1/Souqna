/**
 * Set (or randomise) a store owner's password.
 *   npm run set-password -w server -- townstyle@banhalook.app            # random password, printed once
 *   npm run set-password -w server -- townstyle@banhalook.app "MyNewPass#1"
 */
import crypto from 'node:crypto';
import { q } from '../db/index.js';
import { hashPassword } from '../lib/auth.js';

const [email, given] = process.argv.slice(2);
if (!email) { console.error('usage: set-password <email> [password]'); process.exit(1); }
const pw = given || crypto.randomBytes(12).toString('base64url');
if (pw.length < 8) { console.error('password must be at least 8 characters'); process.exit(1); }
const u = q.get('SELECT id FROM users WHERE LOWER(email)=LOWER(?)', [email]);
if (!u) { console.error('no such user'); process.exit(1); }
const hash = await hashPassword(pw);
q.run('UPDATE users SET password_hash=?, must_change_password=0, token_version=COALESCE(token_version,1)+1 WHERE id=?', [hash, u.id]);
console.log(`Password updated for ${email}${given ? '' : `\nNew password: ${pw}`}`);
