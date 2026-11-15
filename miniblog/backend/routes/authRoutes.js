const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

/**
 * Helper function to generate a signed JWT for a user ID.
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

/**
 * Helper function to format user data safely (never send password to client).
 */
const formatUserResponse = (user) => ({
  _id: user._id,
  name: user.name,
  username: user.username,
  email: user.email,
  bio: user.bio,
  profilePicture: user.profilePicture,
  followers: user.followers,
  following: user.following,
  createdAt: user.createdAt,
});

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user account
 * @access  Public
 */
router.post('/register', async (req, res) => {
  try {
    const { name, username, email, password } = req.body;

    // 1. Validate required fields
    if (!name || !username || !email || !password) {
      return res.status(400).json({ message: 'Please fill in all required fields.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
    const cleanEmail = email.trim().toLowerCase();

    if (cleanUsername.length < 3) {
      return res.status(400).json({ message: 'Username must be at least 3 characters long.' });
    }

    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      return res.status(400).json({
        message: 'Username can only contain lowercase letters, numbers, and underscores.',
      });
    }

    // 2. Check if email or username is already registered
    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail) {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }

    const existingUsername = await User.findOne({ username: cleanUsername });
    if (existingUsername) {
      return res.status(400).json({ message: 'This username is already taken.' });
    }

    // 3. Hash the password using bcrypt before storing
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Create the new user in MongoDB
    const user = await User.create({
      name: name.trim(),
      username: cleanUsername,
      email: cleanEmail,
      password: hashedPassword,
    });

    // 5. Return JWT token and safe user info
    const token = generateToken(user._id);
    return res.status(201).json({
      token,
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ message: 'Server error during registration.' });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Log in an existing user using email and password
 * @access  Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate inputs
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide both email and password.' });
    }

    // 2. Find user by email
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // 3. Compare provided password with stored bcrypt hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // 4. Generate JWT and send response
    const token = generateToken(user._id);
    return res.json({
      token,
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error during login.' });
  }
});

module.exports = router;
