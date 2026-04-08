// lib/db.js
// MongoDB connection utility for Next.js
// Next.js API routes are serverless functions, meaning each request
// could attempt to create a new database connection. This module
// caches the connection so we only connect once and reuse it.

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/beverage-trends';

// Cache the connection promise so we do not reconnect on every request
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  // If we already have a connection, return it immediately
  if (cached.conn) {
    return cached.conn;
  }

  // If a connection attempt is already in progress, wait for it
  if (!cached.promise) {
    const options = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, options).then((mongooseInstance) => {
      console.log('Connected to MongoDB successfully');
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // Reset the promise so the next call can retry
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}

export default connectToDatabase;