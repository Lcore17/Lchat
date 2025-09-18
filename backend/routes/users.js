const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const User = require('../db/models/User');
const auth = require('../middleware/auth');
const { validateRequest, updateProfileSchema } = require('../middleware/validation');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = 'uploads/profiles';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `profile-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Search users
router.get('/search', auth, async (req, res) => {
  try {
    const { query, limit = 20 } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }

    const users = await User.searchUsers(query.trim(), req.user._id)
      .limit(parseInt(limit));

    res.json({
      users: users.map(user => ({
        id: user._id,
        username: user.username,
        nickname: user.nickname,
        profilePictureUrl: user.profilePictureUrl,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen
      }))
    });

  } catch (error) {
    console.error('User search error:', error);
    res.status(500).json({ message: 'Search failed', error: error.message });
  }
});

// Get user profile
router.get('/profile/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('username nickname profilePictureUrl bio isOnline lastSeen isVerified createdAt');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        username: user.username,
        nickname: user.nickname,
        profilePictureUrl: user.profilePictureUrl,
        bio: user.bio,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        isVerified: user.isVerified,
        memberSince: user.createdAt
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to get profile', error: error.message });
  }
});

// Update user profile
router.put('/profile/:id', auth, validateRequest(updateProfileSchema), async (req, res) => {
  try {
    // Check if user is updating their own profile
    if (req.params.id !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only update your own profile' });
    }

    const updates = { ...req.body };
    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-passwordHash');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        nickname: user.nickname,
        profilePictureUrl: user.profilePictureUrl,
        bio: user.bio,
        preferences: user.preferences,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile', error: error.message });
  }
});

// Upload profile picture
router.post('/profile/:id/avatar', auth, upload.single('avatar'), async (req, res) => {
  try {
    // Check if user is updating their own profile
    if (req.params.id !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only update your own profile picture' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Delete old profile picture if exists
    const user = await User.findById(req.user._id);
    if (user.profilePictureUrl) {
      const oldPath = user.profilePictureUrl.replace('/uploads/', '');
      try {
        await fs.unlink(`uploads/${oldPath}`);
      } catch (err) {
        // File might not exist, ignore error
        console.log('Old profile picture not found:', err.message);
      }
    }

    // Update user with new profile picture URL
    const profilePictureUrl = `/uploads/profiles/${req.file.filename}`;
    await User.findByIdAndUpdate(
      req.user._id,
      { profilePictureUrl },
      { new: true }
    );

    // Respond with only the new profilePictureUrl
    res.json({
      message: 'Profile picture updated successfully',
      profilePictureUrl
    });

  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ message: 'Failed to upload profile picture', error: error.message });
  }
});

// Get user's online friends
router.get('/online-friends', auth, async (req, res) => {
  try {
    const FriendRequest = require('../db/models/FriendRequest');
    const friends = await FriendRequest.getFriendsList(req.user._id);
    
    const onlineFriends = friends.filter(friend => friend.isOnline);

    res.json({
      onlineFriends: onlineFriends.map(friend => ({
        id: friend._id,
        username: friend.username,
        nickname: friend.nickname,
        profilePictureUrl: friend.profilePictureUrl,
        lastSeen: friend.lastSeen
      }))
    });

  } catch (error) {
    console.error('Get online friends error:', error);
    res.status(500).json({ message: 'Failed to get online friends', error: error.message });
  }
});

// Delete account
router.delete('/profile/:id', auth, async (req, res) => {
  try {
    // Check if user is deleting their own account
    if (req.params.id !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only delete your own account' });
    }

    // Delete user's profile picture
    const user = await User.findById(req.user._id);
    if (user.profilePictureUrl) {
      const imagePath = user.profilePictureUrl.replace('/uploads/', '');
      try {
        await fs.unlink(`uploads/${imagePath}`);
      } catch (err) {
        console.log('Profile picture not found:', err.message);
      }
    }

    // Delete user account
    await User.findByIdAndDelete(req.user._id);

    res.json({ message: 'Account deleted successfully' });

  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ message: 'Failed to delete account', error: error.message });
  }
});

module.exports = router;