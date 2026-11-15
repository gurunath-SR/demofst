const express = require('express');
const mongoose = require('mongoose');
const Post = require('../models/Post');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route   POST /api/posts
 * @desc    Create a new microblog post (max 280 chars)
 * @access  Private
 */
router.post('/', protect, async (req, res) => {
  try {
    const { content } = req.body;

    // Validate post content
    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Post content cannot be empty.' });
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length > 280) {
      return res.status(400).json({ message: 'Post cannot exceed 280 characters.' });
    }

    const newPost = await Post.create({
      user: req.user._id,
      content: trimmedContent,
    });

    // Populate author details before sending back to the frontend
    const populatedPost = await Post.findById(newPost._id).populate(
      'user',
      'name username profilePicture'
    );

    return res.status(201).json(populatedPost);
  } catch (error) {
    console.error('Create post error:', error);
    return res.status(500).json({ message: 'Server error while creating post.' });
  }
});

/**
 * @route   GET /api/posts/feed
 * @desc    Get home feed (posts from logged-in user + followed users, newest first)
 * @access  Private
 */
router.get('/feed', protect, async (req, res) => {
  try {
    // Include the current user's ID and all user IDs they follow
    const feedUserIds = [req.user._id, ...req.user.following];

    const posts = await Post.find({ user: { $in: feedUserIds } })
      .populate('user', 'name username profilePicture')
      .sort({ createdAt: -1 }); // Newest posts first

    return res.json(posts);
  } catch (error) {
    console.error('Feed error:', error);
    return res.status(500).json({ message: 'Server error while loading feed.' });
  }
});

/**
 * @route   GET /api/posts/:id
 * @desc    Get a single post by ID
 * @access  Private
 */
router.get('/:id', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid post ID.' });
    }

    const post = await Post.findById(req.params.id).populate(
      'user',
      'name username profilePicture'
    );

    if (!post) {
      return res.status(404).json({ message: 'Post not found.' });
    }

    return res.json(post);
  } catch (error) {
    console.error('Get post error:', error);
    return res.status(500).json({ message: 'Server error while fetching post.' });
  }
});

/**
 * @route   PUT /api/posts/:id
 * @desc    Edit a post (only the post owner can edit)
 * @access  Private
 */
router.put('/:id', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid post ID.' });
    }

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Post content cannot be empty.' });
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length > 280) {
      return res.status(400).json({ message: 'Post cannot exceed 280 characters.' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found.' });
    }

    // Ensure users cannot edit posts belonging to other users
    if (post.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not allowed to edit someone else\'s post.' });
    }

    post.content = trimmedContent;
    await post.save();

    const updatedPost = await Post.findById(post._id).populate(
      'user',
      'name username profilePicture'
    );

    return res.json(updatedPost);
  } catch (error) {
    console.error('Update post error:', error);
    return res.status(500).json({ message: 'Server error while updating post.' });
  }
});

/**
 * @route   DELETE /api/posts/:id
 * @desc    Delete a post (only the post owner can delete)
 * @access  Private
 */
router.delete('/:id', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid post ID.' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found.' });
    }

    // Ensure users cannot delete posts belonging to other users
    if (post.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not allowed to delete someone else\'s post.' });
    }

    await post.deleteOne();
    return res.json({ message: 'Post deleted successfully.' });
  } catch (error) {
    console.error('Delete post error:', error);
    return res.status(500).json({ message: 'Server error while deleting post.' });
  }
});

/**
 * @route   POST /api/posts/:id/like
 * @desc    Like or unlike a post (prevents duplicate likes from the same user)
 * @access  Private
 */
router.post('/:id/like', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid post ID.' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found.' });
    }

    const userId = req.user._id.toString();
    const alreadyLiked = post.likes.some((id) => id.toString() === userId);

    if (alreadyLiked) {
      // Unlike: remove the user's ID from the likes array
      post.likes = post.likes.filter((id) => id.toString() !== userId);
    } else {
      // Like: add the user's ID (guaranteed unique because we checked above)
      post.likes.push(req.user._id);
    }

    await post.save();

    return res.json({
      liked: !alreadyLiked,
      likesCount: post.likes.length,
      likes: post.likes,
    });
  } catch (error) {
    console.error('Like post error:', error);
    return res.status(500).json({ message: 'Server error while liking post.' });
  }
});

module.exports = router;
