const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route   GET /api/users/suggested
 * @desc    Get suggested users to follow (used by the right sidebar)
 * @access  Private
 * @note    Defined BEFORE /:id so "suggested" is not treated as a user ID
 */
router.get('/suggested', protect, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select('name username bio profilePicture followers following')
      .sort({ createdAt: -1 })
      .limit(10);

    return res.json(users);
  } catch (error) {
    console.error('Suggested users error:', error);
    return res.status(500).json({ message: 'Server error while fetching suggested users.' });
  }
});

/**
 * @route   PUT /api/users/profile
 * @desc    Update the logged-in user's own profile
 * @access  Private
 * @note    Defined BEFORE /:id so "profile" is not treated as a user ID
 */
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, username, bio, profilePicture } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ message: 'Name cannot be empty.' });
      }
      user.name = name.trim();
    }

    if (username !== undefined) {
      const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
      if (cleanUsername.length < 3) {
        return res.status(400).json({ message: 'Username must be at least 3 characters.' });
      }
      if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
        return res.status(400).json({
          message: 'Username can only contain lowercase letters, numbers, and underscores.',
        });
      }
      // Check if another user already owns this username
      const existingUser = await User.findOne({
        username: cleanUsername,
        _id: { $ne: user._id },
      });
      if (existingUser) {
        return res.status(400).json({ message: 'This username is already taken.' });
      }
      user.username = cleanUsername;
    }

    if (bio !== undefined) {
      if (bio.length > 160) {
        return res.status(400).json({ message: 'Bio cannot exceed 160 characters.' });
      }
      user.bio = bio.trim();
    }

    if (profilePicture !== undefined) {
      user.profilePicture = profilePicture.trim();
    }

    await user.save();

    const updatedUser = await User.findById(user._id).select('-password');
    return res.json(updatedUser);
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ message: 'Server error while updating profile.' });
  }
});

/**
 * @route   GET /api/users/:id
 * @desc    Get a user's profile details and all posts created by that user
 * @access  Private
 */
router.get('/:id', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Fetch all posts created by this user (newest first)
    const posts = await Post.find({ user: user._id })
      .populate('user', 'name username profilePicture')
      .sort({ createdAt: -1 });

    return res.json({
      user,
      posts,
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    return res.status(500).json({ message: 'Server error while fetching user profile.' });
  }
});

/**
 * @route   POST /api/users/:id/follow
 * @desc    Follow another user (prevents following yourself)
 * @access  Private
 */
router.post('/:id/follow', protect, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user._id.toString();

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    // Prevent users from following themselves
    if (targetUserId === currentUserId) {
      return res.status(400).json({ message: 'You cannot follow yourself.' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User to follow not found.' });
    }

    // Use $addToSet so duplicate follow IDs are never added
    await User.findByIdAndUpdate(targetUserId, {
      $addToSet: { followers: req.user._id },
    });

    const updatedCurrentUser = await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { following: targetUserId } },
      { new: true }
    ).select('-password');

    const updatedTargetUser = await User.findById(targetUserId).select('followers following');

    return res.json({
      message: `You are now following @${targetUser.username}`,
      following: updatedCurrentUser.following,
      targetFollowersCount: updatedTargetUser.followers.length,
    });
  } catch (error) {
    console.error('Follow user error:', error);
    return res.status(500).json({ message: 'Server error while following user.' });
  }
});

/**
 * @route   POST /api/users/:id/unfollow
 * @desc    Unfollow a user
 * @access  Private
 */
router.post('/:id/unfollow', protect, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user._id.toString();

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    if (targetUserId === currentUserId) {
      return res.status(400).json({ message: 'You cannot unfollow yourself.' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Use $pull to remove IDs from followers and following arrays
    await User.findByIdAndUpdate(targetUserId, {
      $pull: { followers: req.user._id },
    });

    const updatedCurrentUser = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { following: targetUserId } },
      { new: true }
    ).select('-password');

    const updatedTargetUser = await User.findById(targetUserId).select('followers following');

    return res.json({
      message: `Unfollowed @${targetUser.username}`,
      following: updatedCurrentUser.following,
      targetFollowersCount: updatedTargetUser.followers.length,
    });
  } catch (error) {
    console.error('Unfollow user error:', error);
    return res.status(500).json({ message: 'Server error while unfollowing user.' });
  }
});

/**
 * @route   GET /api/users/:id/followers
 * @desc    Get list of followers for a user
 * @access  Private
 */
router.get('/:id/followers', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    const user = await User.findById(req.params.id).populate(
      'followers',
      'name username bio profilePicture'
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.json(user.followers);
  } catch (error) {
    console.error('Get followers error:', error);
    return res.status(500).json({ message: 'Server error while fetching followers.' });
  }
});

/**
 * @route   GET /api/users/:id/following
 * @desc    Get list of users that this user follows
 * @access  Private
 */
router.get('/:id/following', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    const user = await User.findById(req.params.id).populate(
      'following',
      'name username bio profilePicture'
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.json(user.following);
  } catch (error) {
    console.error('Get following error:', error);
    return res.status(500).json({ message: 'Server error while fetching following list.' });
  }
});

module.exports = router;
