/**
 * MongoDB connection (auth storage: users + sessions).
 *
 * Configure via .env.local:
 *   MONGODB_URI=mongodb://localhost:27017
 *   MONGODB_DB=captionai
 *
 * Uses the standard Next.js pattern of a globally-cached client promise so
 * dev hot-reloads don't leak connections.
 */

import { Db, MongoClient } from "mongodb";
import { ensureIndexes } from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __captionaiMongo: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var __captionaiMongoIndexes: Promise<unknown> | undefined;
}

const SESSION_TTL_S = 60 * 60 * 24 * 30;

async function connect(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Add it to .env.local (and restart the server)."
    );
  }
  if (!global.__captionaiMongo) {
    global.__captionaiMongo = new MongoClient(uri, { maxPoolSize: 5 }).connect();
  }
  const client = await global.__captionaiMongo;
  return client.db(process.env.MONGODB_DB || "captionai");
}

export async function db(): Promise<Db> {
  const d = await connect();
  // Session documents self-delete via a MongoDB TTL index.
  global.__captionaiMongoIndexes ??= ensureIndexes(d).catch((err) =>
    console.error("[db] index creation failed:", String(err))
  );
  await global.__captionaiMongoIndexes;
  return d;
}
