import crypto from "crypto";
import type { Request, Response, Application } from "express";

const ENABLE_AI_CHAT = process.env.ENABLE_AI_CHAT === "true";
const CHAT_ACCESS_PASSPHRASE = process.env.CHAT_ACCESS_PASSPHRASE || "";
const CHAT_TOKEN_SECRET = process.env.CHAT_TOKEN_SECRET || "";

// Startup guard: refuse to run if token secret is weak — prevents silent auth bypass on bad deploys
if (ENABLE_AI_CHAT && (!CHAT_TOKEN_SECRET || CHAT_TOKEN_SECRET.length < 32)) {
  throw new Error(
    "FATAL: CHAT_TOKEN_SECRET must be at least 32 characters when ENABLE_AI_CHAT=true. " +
    "Set this environment variable to a long random string before starting the server."
  );
}

export const CHAT_SOFT_LIMIT = 1400;
export let chatRequestCount = 0;
export let chatCounterDate = new Date().toUTCString().split(" ").slice(0, 4).join(" ");

export function resetCounterIfNewDay() {
  const today = new Date().toUTCString().split(" ").slice(0, 4).join(" ");
  if (today !== chatCounterDate) {
    chatRequestCount = 0;
    chatCounterDate = today;
  }
}

export function incrementChatCount() {
  chatRequestCount++;
}

export function generateToken(passphrase: string): string {
  const expiry = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  const payload = `${passphrase}:${expiry}`;
  const sig = crypto.createHmac("sha256", CHAT_TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${expiry}:${sig}`).toString("base64");
}

export function validateToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [expiryStr, sig] = decoded.split(":");
    const expiry = parseInt(expiryStr, 10);
    if (Date.now() / 1000 > expiry) return false;
    const payload = `${CHAT_ACCESS_PASSPHRASE}:${expiry}`;
    const expected = crypto.createHmac("sha256", CHAT_TOKEN_SECRET).update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function registerAuthRoutes(app: Application) {
  app.post("/api/chat/verify", (req: Request, res: Response) => {
    if (!ENABLE_AI_CHAT) return res.status(403).json({ error: "Chat feature is disabled." });
    const { passphrase } = req.body;
    if (!passphrase || passphrase !== CHAT_ACCESS_PASSPHRASE) {
      return res.status(401).json({ error: "Incorrect passphrase." });
    }
    const token = generateToken(passphrase);
    res.json({ token });
  });
}
