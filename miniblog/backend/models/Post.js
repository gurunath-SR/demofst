const mongoose = require('mongoose');

/**
 * Post Schema
 * Represents a microblog post (up to 280 characters) with likes and timestamps.
 */
const postSchema = new mongoose.Schema(
  {
    // Reference to the User who created this post
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: [true, 'Post content cannot be empty'],
      trim: true,
      maxlength: [280, 'Post cannot exceed 280 characters'],
    },
    // Array of User IDs who liked this post
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    // Automatically manages createdAt and updatedAt fields
    timestamps: true,
  }
);

module.exports = mongoose.model('Post', postSchema);
