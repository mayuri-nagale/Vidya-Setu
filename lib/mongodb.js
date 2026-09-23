import { MongoClient } from "mongodb";
import { ensureDatabaseSchema } from "./database";
import { mongoConfig } from "./config";

if (!globalThis.__vidyaSetuMongo) {
  globalThis.__vidyaSetuMongo = { client: null, promise: null, schemaPromise: null };
}

export async function getDb() {
  const { uri, dbName } = mongoConfig();
  if (!globalThis.__vidyaSetuMongo.promise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    globalThis.__vidyaSetuMongo.client = client;
    globalThis.__vidyaSetuMongo.promise = client.connect();
  }

  const client = await globalThis.__vidyaSetuMongo.promise;
  const db = client.db(dbName);

  if (!globalThis.__vidyaSetuMongo.schemaPromise) {
    globalThis.__vidyaSetuMongo.schemaPromise = ensureDatabaseSchema(db).catch((error) => {
      globalThis.__vidyaSetuMongo.schemaPromise = null;
      throw error;
    });
  }
  await globalThis.__vidyaSetuMongo.schemaPromise;

  return db;
}
