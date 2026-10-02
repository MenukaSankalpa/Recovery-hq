import mongoose from 'mongoose';

// Cached connection so Vercel serverless functions reuse one pool between calls.
// If MONGODB_URI changes while the dev server runs (.env.local edited), it reconnects to the new database.
let cached = globalThis._mongoose;
if (!cached) cached = globalThis._mongoose = { conn: null, promise: null, uri: null };

export async function dbConnect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw Object.assign(new Error('MONGODB_URI is not set'), { status: 500 });
  if (cached.uri && cached.uri !== uri) {
    try { await mongoose.disconnect(); } catch {}
    cached.conn = null;
    cached.promise = null;
  }
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.uri = uri;
    cached.promise = mongoose.connect(uri, { bufferCommands: false, maxPoolSize: 10, serverSelectionTimeoutMS: 10000 });
  }
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    cached.uri = null;
    throw e;
  }
  return cached.conn;
}
