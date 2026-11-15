const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load environment variables from .env
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors()); // Allow cross-origin requests from frontend dev servers
app.use(express.json()); // Parse incoming JSON request bodies

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/posts', require('./routes/postRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

// Simple API health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'MiniBlog API is running' });
});

// Serve the static frontend folder for convenience when running from a single server
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Fallback for unknown API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'API route not found.' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong on the server.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`MiniBlog server running on http://localhost:${PORT}`);
});
