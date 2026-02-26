/**
 * config/db.js — MongoDB Connection Module
 *
 * Establishes a connection to MongoDB using the MONGO_URI environment variable.
 * Called once during server startup in server.js. If the connection fails,
 * the process exits with code 1 to prevent the server from running without a database.
 */
const mongoose = require('mongoose');

/**
 * Connect to MongoDB Atlas (or local MongoDB) using Mongoose.
 * Logs the connected host on success, or exits the process on failure.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    // Fatal error — the app cannot function without its database
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
