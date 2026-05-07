const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../db/models/User');
const auth = require('../middleware/auth');
const { validateRequest, registerSchema, loginSchema } = require('../middleware/validation');

const router = express.Router();

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Register user
router.post('/register', validateRequest(registerSchema), async (req, res) => {
  try {
    const { email, username, password, nickname } = req.body;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim();
    const normalizedNickname = (nickname || normalizedUsername).trim();

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }]
    });

    if (existingUser) {
      if (existingUser.email === normalizedEmail) {
        return res.status(400).json({ message: 'Email already registered' });
      }
      if (existingUser.username === normalizedUsername) {
        return res.status(400).json({ message: 'Username already taken' });
      }
    }

    // Create new user
    const user = new User({
      email: normalizedEmail,
      username: normalizedUsername,
      passwordHash: password, // Will be hashed by pre-save middleware
      nickname: normalizedNickname
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id }, 
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        nickname: user.nickname,
        profilePictureUrl: user.profilePictureUrl,
        preferences: user.preferences
      }
    });

  } catch (error) {
    console.error('Registration error:', error);

    if (error && error.code === 11000) {
      if (error.keyPattern?.email) {
        return res.status(400).json({ message: 'Email already registered' });
      }
      if (error.keyPattern?.username) {
        return res.status(400).json({ message: 'Username already taken' });
      }
      return res.status(400).json({ message: 'Email or username already exists' });
    }

    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
});

// Login user
router.post('/login', validateRequest(loginSchema), async (req, res) => {
  try {
    const { login, password } = req.body;
    const normalizedLogin = String(login || '').trim();
    const normalizedEmail = normalizedLogin.toLowerCase();
    const usernameRegex = new RegExp(`^${escapeRegex(normalizedLogin)}$`, 'i');

    if (!normalizedLogin) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Find user by email or username
    const user = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedLogin }, { username: usernameRegex }]
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Update last seen and online status
    user.lastSeen = new Date();
    user.isOnline = true;
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        nickname: user.nickname,
        profilePictureUrl: user.profilePictureUrl,
        preferences: user.preferences,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        nickname: user.nickname,
        profilePictureUrl: user.profilePictureUrl,
        bio: user.bio,
        preferences: user.preferences,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: 'Failed to get user info', error: error.message });
  }
});

// Logout user
router.post('/logout', auth, async (req, res) => {
  try {
    // Update user offline status
    await User.findByIdAndUpdate(req.user._id, {
      isOnline: false,
      lastSeen: new Date()
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Logout failed', error: error.message });
  }
});

// Refresh token
router.post('/refresh', auth, async (req, res) => {
  try {
    const token = jwt.sign(
      { userId: req.user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({ token });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ message: 'Token refresh failed', error: error.message });
  }
});

module.exports = router;