import session from 'express-session';
import { env } from '../config/env';
import { PrismaSessionStore } from '../session/prisma-session-store';

export const sessionStore = new PrismaSessionStore(env.sessionTtlMs);

export const sessionMiddleware = session({
  name: env.SESSION_COOKIE_NAME,
  secret: env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: env.sessionTtlMs,
  },
  proxy: env.TRUST_PROXY,
});
