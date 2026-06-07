import crypto from 'crypto';

// Lightweight stateless session: an HMAC-signed token stored in an httpOnly
// cookie. No external deps. The cookie is the ONLY thing the server trusts —
// anything in localStorage is treated as untrusted UX cache.

const COOKIE_NAME = 'cashlo_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret() {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        console.error('[session] AUTH_SECRET is not set. Set a long random value in env.');
        // Use a constant fallback so dev doesn't hard-crash, but it is NOT secure.
        return 'INSECURE_DEV_FALLBACK_SECRET_set_AUTH_SECRET';
    }
    return secret;
}

function b64url(input) {
    return Buffer.from(input).toString('base64url');
}

function sign(payloadStr) {
    return crypto.createHmac('sha256', getSecret()).update(payloadStr).digest('base64url');
}

// Create the signed token string for a user payload.
export function createSessionToken(user) {
    const payload = {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        owner_id: user.owner_id,
        exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
    };
    const payloadStr = b64url(JSON.stringify(payload));
    return `${payloadStr}.${sign(payloadStr)}`;
}

// Verify a token string and return the user payload, or null if invalid/expired.
export function verifySessionToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [payloadStr, sig] = token.split('.');
    if (!payloadStr || !sig) return null;

    const expected = sign(payloadStr);
    // Constant-time comparison to avoid timing attacks.
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    let payload;
    try {
        payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
}

// Build a Set-Cookie header value carrying the session.
export function buildSessionCookie(user) {
    const token = createSessionToken(user);
    const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
    return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=${MAX_AGE_SECONDS}`;
}

// Build a Set-Cookie header value that clears the session.
export function buildClearCookie() {
    const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=0`;
}

// Read + verify the session user from an API request. Returns payload or null.
export function getSessionUser(req) {
    const token = req.cookies?.[COOKIE_NAME];
    return verifySessionToken(token);
}

export { COOKIE_NAME };
