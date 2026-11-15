import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'miniblog_preview_jwt_secret_key';
const MONGO_URI = process.env.MONGO_URI || '';

interface UserRecord {
  _id: string;
  name: string;
  username: string;
  email: string;
  password: string;
  bio: string;
  profilePicture: string;
  followers: string[];
  following: string[];
  createdAt: string;
}

interface PostRecord {
  _id: string;
  user: string;
  content: string;
  likes: string[];
  createdAt: string;
  updatedAt: string;
}

interface AuthedRequest extends Request {
  userId?: string;
}

// ============================================================================
// In-Memory Fallback Store (used when no local MongoDB daemon is configured)
// Mirrors the exact Mongoose User & Post schemas and API contract.
// ============================================================================

const usersStore: UserRecord[] = [];
const postsStore: PostRecord[] = [];

function createId(): string {
  return new mongoose.Types.ObjectId().toString();
}

function seedPreviewData(): void {
  if (usersStore.length > 0) return;

  const passwordHash = bcrypt.hashSync('password123', 10);
  const now = Date.now();

  const alex: UserRecord = {
    _id: createId(),
    name: 'Alex Rivera',
    username: 'alexrivera',
    email: 'alex@miniblog.dev',
    password: passwordHash,
    bio: 'Building clean web apps and writing short notes on JavaScript.',
    profilePicture: '',
    followers: [],
    following: [],
    createdAt: new Date(now - 1000 * 60 * 60 * 24 * 12).toISOString(),
  };

  const priya: UserRecord = {
    _id: createId(),
    name: 'Priya Nair',
    username: 'priyanair',
    email: 'priya@miniblog.dev',
    password: passwordHash,
    bio: 'Backend systems, databases, and calm UI design.',
    profilePicture: '',
    followers: [],
    following: [],
    createdAt: new Date(now - 1000 * 60 * 60 * 24 * 8).toISOString(),
  };

  const sam: UserRecord = {
    _id: createId(),
    name: 'Sam Chen',
    username: 'samchen',
    email: 'sam@miniblog.dev',
    password: passwordHash,
    bio: 'Minimalist software engineer. Coffee and CSS.',
    profilePicture: '',
    followers: [],
    following: [],
    createdAt: new Date(now - 1000 * 60 * 60 * 24 * 5).toISOString(),
  };

  alex.following.push(priya._id);
  priya.followers.push(alex._id);

  usersStore.push(alex, priya, sam);

  postsStore.push(
    {
      _id: createId(),
      user: priya._id,
      content: 'Clean data models make everything downstream twice as simple to reason about.',
      likes: [alex._id],
      createdAt: new Date(now - 1000 * 60 * 45).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 45).toISOString(),
    },
    {
      _id: createId(),
      user: alex._id,
      content: 'Just shipped the first version of MiniBlog with Express, JWT auth, and vanilla JS!',
      likes: [priya._id, sam._id],
      createdAt: new Date(now - 1000 * 60 * 120).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 120).toISOString(),
    },
    {
      _id: createId(),
      user: sam._id,
      content: 'Reminder: readable code beats clever abstractions almost every time.',
      likes: [],
      createdAt: new Date(now - 1000 * 60 * 240).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 240).toISOString(),
    }
  );
}

function sanitizeUser(u: UserRecord) {
  return {
    _id: u._id,
    name: u.name,
    username: u.username,
    email: u.email,
    bio: u.bio,
    profilePicture: u.profilePicture,
    followers: u.followers,
    following: u.following,
    createdAt: u.createdAt,
  };
}

function populatePost(p: PostRecord) {
  const author = usersStore.find((u) => u._id === p.user);
  return {
    _id: p._id,
    user: author
      ? {
          _id: author._id,
          name: author.name,
          username: author.username,
          profilePicture: author.profilePicture,
        }
      : null,
    content: p.content,
    likes: p.likes,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

async function startServer(): Promise<void> {
  let usingMongo = false;

  if (MONGO_URI) {
    try {
      await mongoose.connect(MONGO_URI);
      usingMongo = true;
      console.log('Connected to MongoDB');
    } catch (err) {
      console.warn('MongoDB unavailable, using in-memory store for preview:', (err as Error).message);
    }
  }

  if (!usingMongo) {
    seedPreviewData();
  }

  const app = express();
  app.use(cors());
  app.use(express.json());

  const protect = (req: AuthedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Not authorized. Please log in.' });
      return;
    }
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
      const exists = usersStore.some((u) => u._id === decoded.id);
      if (!exists) {
        res.status(401).json({ message: 'User belonging to this token no longer exists.' });
        return;
      }
      req.userId = decoded.id;
      next();
    } catch {
      res.status(401).json({ message: 'Invalid or expired token. Please log in again.' });
    }
  };

  // Auth Routes
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    const { name, username, email, password } = req.body as Record<string, string>;
    if (!name || !username || !email || !password) {
      res.status(400).json({ message: 'Please fill in all required fields.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters long.' });
      return;
    }

    const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
    const cleanEmail = email.trim().toLowerCase();

    if (cleanUsername.length < 3 || !/^[a-z0-9_]+$/.test(cleanUsername)) {
      res.status(400).json({
        message: 'Username must be at least 3 characters (letters, numbers, underscores only).',
      });
      return;
    }

    if (usersStore.some((u) => u.email === cleanEmail)) {
      res.status(400).json({ message: 'An account with this email already exists.' });
      return;
    }
    if (usersStore.some((u) => u.username === cleanUsername)) {
      res.status(400).json({ message: 'This username is already taken.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser: UserRecord = {
      _id: createId(),
      name: name.trim(),
      username: cleanUsername,
      email: cleanEmail,
      password: hashedPassword,
      bio: '',
      profilePicture: '',
      followers: [],
      following: [],
      createdAt: new Date().toISOString(),
    };
    usersStore.push(newUser);

    const token = jwt.sign({ id: newUser._id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: sanitizeUser(newUser) });
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { email, password } = req.body as Record<string, string>;
    if (!email || !password) {
      res.status(400).json({ message: 'Please provide both email and password.' });
      return;
    }

    const user = usersStore.find((u) => u.email === email.trim().toLowerCase());
    if (!user) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: sanitizeUser(user) });
  });

  // Post Routes
  app.post('/api/posts', protect, (req: AuthedRequest, res: Response) => {
    const { content } = req.body as { content?: string };
    if (!content || !content.trim()) {
      res.status(400).json({ message: 'Post content cannot be empty.' });
      return;
    }
    const trimmed = content.trim();
    if (trimmed.length > 280) {
      res.status(400).json({ message: 'Post cannot exceed 280 characters.' });
      return;
    }

    const now = new Date().toISOString();
    const post: PostRecord = {
      _id: createId(),
      user: req.userId!,
      content: trimmed,
      likes: [],
      createdAt: now,
      updatedAt: now,
    };
    postsStore.unshift(post);
    res.status(201).json(populatePost(post));
  });

  app.get('/api/posts/feed', protect, (req: AuthedRequest, res: Response) => {
    const currentUser = usersStore.find((u) => u._id === req.userId);
    if (!currentUser) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const feedIds = new Set([currentUser._id, ...currentUser.following]);
    const feedPosts = postsStore
      .filter((p) => feedIds.has(p.user))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(populatePost);
    res.json(feedPosts);
  });

  app.get('/api/posts/:id', protect, (req: AuthedRequest, res: Response) => {
    const post = postsStore.find((p) => p._id === req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }
    res.json(populatePost(post));
  });

  app.put('/api/posts/:id', protect, (req: AuthedRequest, res: Response) => {
    const post = postsStore.find((p) => p._id === req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }
    if (post.user !== req.userId) {
      res.status(403).json({ message: "You are not allowed to edit someone else's post." });
      return;
    }
    const { content } = req.body as { content?: string };
    if (!content || !content.trim()) {
      res.status(400).json({ message: 'Post content cannot be empty.' });
      return;
    }
    if (content.trim().length > 280) {
      res.status(400).json({ message: 'Post cannot exceed 280 characters.' });
      return;
    }
    post.content = content.trim();
    post.updatedAt = new Date().toISOString();
    res.json(populatePost(post));
  });

  app.delete('/api/posts/:id', protect, (req: AuthedRequest, res: Response) => {
    const idx = postsStore.findIndex((p) => p._id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }
    if (postsStore[idx].user !== req.userId) {
      res.status(403).json({ message: "You are not allowed to delete someone else's post." });
      return;
    }
    postsStore.splice(idx, 1);
    res.json({ message: 'Post deleted successfully.' });
  });

  app.post('/api/posts/:id/like', protect, (req: AuthedRequest, res: Response) => {
    const post = postsStore.find((p) => p._id === req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }
    const alreadyLiked = post.likes.includes(req.userId!);
    if (alreadyLiked) {
      post.likes = post.likes.filter((id) => id !== req.userId);
    } else {
      post.likes.push(req.userId!);
    }
    res.json({
      liked: !alreadyLiked,
      likesCount: post.likes.length,
      likes: post.likes,
    });
  });

  // User Routes
  app.get('/api/users/suggested', protect, (req: AuthedRequest, res: Response) => {
    const suggested = usersStore
      .filter((u) => u._id !== req.userId)
      .slice(0, 10)
      .map(sanitizeUser);
    res.json(suggested);
  });

  app.put('/api/users/profile', protect, (req: AuthedRequest, res: Response) => {
    const user = usersStore.find((u) => u._id === req.userId);
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const { name, username, bio, profilePicture } = req.body as Record<string, string | undefined>;
    if (name !== undefined) {
      if (!name.trim()) {
        res.status(400).json({ message: 'Name cannot be empty.' });
        return;
      }
      user.name = name.trim();
    }
    if (username !== undefined) {
      const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
      if (cleanUsername.length < 3 || !/^[a-z0-9_]+$/.test(cleanUsername)) {
        res.status(400).json({
          message: 'Username must be at least 3 characters (letters, numbers, underscores only).',
        });
        return;
      }
      if (usersStore.some((u) => u.username === cleanUsername && u._id !== user._id)) {
        res.status(400).json({ message: 'This username is already taken.' });
        return;
      }
      user.username = cleanUsername;
    }
    if (bio !== undefined) {
      if (bio.length > 160) {
        res.status(400).json({ message: 'Bio cannot exceed 160 characters.' });
        return;
      }
      user.bio = bio.trim();
    }
    if (profilePicture !== undefined) {
      user.profilePicture = profilePicture.trim();
    }
    res.json(sanitizeUser(user));
  });

  app.get('/api/users/:id', protect, (req: AuthedRequest, res: Response) => {
    const user = usersStore.find((u) => u._id === req.params.id);
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const posts = postsStore
      .filter((p) => p.user === user._id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(populatePost);
    res.json({ user: sanitizeUser(user), posts });
  });

  app.post('/api/users/:id/follow', protect, (req: AuthedRequest, res: Response) => {
    const targetId = req.params.id;
    if (targetId === req.userId) {
      res.status(400).json({ message: 'You cannot follow yourself.' });
      return;
    }
    const targetUser = usersStore.find((u) => u._id === targetId);
    const currentUser = usersStore.find((u) => u._id === req.userId);
    if (!targetUser || !currentUser) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    if (!targetUser.followers.includes(currentUser._id)) {
      targetUser.followers.push(currentUser._id);
    }
    if (!currentUser.following.includes(targetUser._id)) {
      currentUser.following.push(targetUser._id);
    }
    res.json({
      message: `You are now following @${targetUser.username}`,
      following: currentUser.following,
      targetFollowersCount: targetUser.followers.length,
    });
  });

  app.post('/api/users/:id/unfollow', protect, (req: AuthedRequest, res: Response) => {
    const targetId = req.params.id;
    if (targetId === req.userId) {
      res.status(400).json({ message: 'You cannot unfollow yourself.' });
      return;
    }
    const targetUser = usersStore.find((u) => u._id === targetId);
    const currentUser = usersStore.find((u) => u._id === req.userId);
    if (!targetUser || !currentUser) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    targetUser.followers = targetUser.followers.filter((id) => id !== currentUser._id);
    currentUser.following = currentUser.following.filter((id) => id !== targetUser._id);
    res.json({
      message: `Unfollowed @${targetUser.username}`,
      following: currentUser.following,
      targetFollowersCount: targetUser.followers.length,
    });
  });

  app.get('/api/users/:id/followers', protect, (req: AuthedRequest, res: Response) => {
    const user = usersStore.find((u) => u._id === req.params.id);
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const followers = user.followers
      .map((fid) => usersStore.find((u) => u._id === fid))
      .filter((u): u is UserRecord => Boolean(u))
      .map(sanitizeUser);
    res.json(followers);
  });

  app.get('/api/users/:id/following', protect, (req: AuthedRequest, res: Response) => {
    const user = usersStore.find((u) => u._id === req.params.id);
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    const following = user.following
      .map((fid) => usersStore.find((u) => u._id === fid))
      .filter((u): u is UserRecord => Boolean(u))
      .map(sanitizeUser);
    res.json(following);
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'MiniBlog API is running' });
  });

  // Serve the MiniBlog Vanilla HTML/CSS/JS frontend directly
  const frontendDir = path.join(__dirname, 'miniblog', 'frontend');
  app.use(express.static(frontendDir));

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MiniBlog preview server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
