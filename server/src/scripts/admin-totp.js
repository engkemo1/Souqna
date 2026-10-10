/** Generate a secret for the admin two-step confirmation. Add it to your host's env as ADMIN_TOTP_SECRET, then scan/enter it in an authenticator app. */
import { newSecret, otpauthUri } from '../lib/totp.js';
const secret = process.env.ADMIN_TOTP_SECRET || newSecret();
console.log(`\nADMIN_TOTP_SECRET=${secret}\n\nIn Google Authenticator / Microsoft Authenticator: "Add account" → "Enter a setup key" → paste the secret above (type: time-based).\nOr open this link on the phone that has the app:\n${otpauthUri(secret, 'admin')}\n`);
