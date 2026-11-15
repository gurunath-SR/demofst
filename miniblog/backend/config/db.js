const mongoose = require('mongoose');

/**
 * Connect to MongoDB using the MONGO_URI environment variable.
 * Keeping database configuration in a separate file keeps server.js clean.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    // Exit process with failure if database cannot connect
    process.exit(1);
  }
};

module.exports = connectDB;
