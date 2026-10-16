/**
 * Auth backed by MongoDB: scrypt-hashed users + token sessions (sessions
 * expire via a TTL index, with an app-level check as belt & suspenders).
 * Password hashing uses Node's built-in crypto — no extra dependencies.
 */

import crypto from "crypto";
import { db } from "./db";

export const COOKIE_NAME = "captionai_session";
export const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days
const SESSION_TTL_MS = COOKIE_MAX_AGE_S * 1000;

import type { UserDoc } from "./schema";

interface SessionDoc {
  _id: string; // token
  username: string;
  createdAt: Date;
}

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Canonical mailbox key so one person can't farm free tiers with aliases:
 * lowercase, strip "+tag", and drop dots for gmail/googlemail.
 */
export function emailKeyOf(email: string): string {
  const [rawLocal, rawDomain = ""] = email.trim().toLowerCase().split("@");
  let domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  let local = rawLocal.split("+")[0];
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

export async function createUser(username: string, password: string, email: string): Promise<void> {
  email = email.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw new Error("Please enter a valid email address.");
  }
  if (!USERNAME_RE.test(username)) {
    throw new Error("Username must be 3–24 chars: letters, numbers, _ . -");
  }
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  const doc: UserDoc = {
    _id: username.toLowerCase(),
    username,
    email,
    emailKey: emailKeyOf(email),
    salt,
    hash,
    createdAt: new Date(),
  };
  try {
    await (await db()).collection<UserDoc>("users").insertOne(doc);
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
      const key = String((err as { message?: string }).message || "");
      throw new Error(
        key.includes("emailKey")
          ? "An account with this email already exists. Log in instead."
          : "That username is taken."
      );
    }
    throw err;
  }
}

/** `identifier` is a username or an email. Returns the canonical username, or null. */
export async function verifyUser(identifier: string, password: string): Promise<string | null> {
  const col = (await db()).collection<UserDoc>("users");
  const id = identifier.trim();
  const rec = id.includes("@")
    ? await col.findOne({ emailKey: emailKeyOf(id) })
    : await col.findOne({ _id: id.toLowerCase() });
  if (!rec) return null;
  const hash = crypto.scryptSync(password, rec.salt, 64);
  const expected = Buffer.from(rec.hash, "hex");
  const ok = hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
  return ok ? rec.username : null;
}

export async function createSession(username: string): Promise<string> {
  const token = crypto.randomBytes(24).toString("hex");
  const doc: SessionDoc = { _id: token, username, createdAt: new Date() };
  await (await db()).collection<SessionDoc>("sessions").insertOne(doc);
  return token;
}

/** Returns the username for a session token, or null (expired/missing/error). */
export async function getSessionUser(token: string): Promise<string | null> {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  try {
    const col = (await db()).collection<SessionDoc>("sessions");
    const rec = await col.findOne({ _id: token });
    if (!rec) return null;
    if (Date.now() - rec.createdAt.getTime() > SESSION_TTL_MS) {
      col.deleteOne({ _id: token }).catch(() => {});
      return null;
    }
    return rec.username;
  } catch (err) {
    // DB unreachable/misconfigured: treat as logged out, don't crash the page.
    console.error("[auth] session lookup failed:", String(err));
    return null;
  }
}

export async function destroySession(token: string): Promise<void> {
  try {
    await (await db()).collection<SessionDoc>("sessions").deleteOne({ _id: token });
  } catch {
    /* best effort */
  }
}

/** Extract the session token from a request's cookie header. */
export function tokenFromRequest(req: Request): string | null {
  const header = req.headers.get("cookie") || "";
  const m = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([a-f0-9]+)`).exec(header);
  return m ? m[1] : null;
}

/** The authed username for this request, or null. */
export async function getRequestUser(req: Request): Promise<string | null> {
  const token = tokenFromRequest(req);
  return token ? getSessionUser(token) : null;
}
