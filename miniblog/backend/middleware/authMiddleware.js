const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Authentication Middleware
 * Protects private routes by verifying the JWT sent in the Authorization header.
 * Expected format: "Authorization: Bearer <token>"
 */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Check if the Authorization header exists and starts with "Bearer "
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized. Please log in.' });
    }

    // Extract the token from "Bearer <token>"
    const token = authHeader.split(' ')[1];

    // Verify the token using our secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch the user from the database (exclude the password field)
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ message: 'User belonging to this token no longer exists.' });
    }

    // Attach the authenticated user to the request object for use in route handlers
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token. Please log in again.' });
  }
};

module.exports = protect;
