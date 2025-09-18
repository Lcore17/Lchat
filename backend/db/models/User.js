const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  passwordHash: {
    type: String,
    required: true,
    minlength: 6
  },
  nickname: {
    type: String,
    trim: true,
    maxlength: 50,
    default: function() {
      return this.username;
    }
  },
  profilePictureUrl: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    maxlength: 160,
    default: ''
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    },
    defaultTranslateLanguage: {
      type: String,
      enum: ['en', 'mr', 'te', 'ta','hi'],
      default: 'en'
    },
    autoTranslate: {
      type: Boolean,
      default: false
    },
    notifications: {
      messages: { type: Boolean, default: true },
      friendRequests: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true }
    }
  }
}, {
  timestamps: true
});

// Index for search functionality
userSchema.index({ username: 'text', nickname: 'text', email: 'text' });
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Transform output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.passwordHash;
  return userObject;
};

// Static method to find users for search
userSchema.statics.searchUsers = function(query, currentUserId) {
  const searchRegex = new RegExp(query, 'i');
  return this.find({
    _id: { $ne: currentUserId },
    $or: [
      { username: searchRegex },
      { nickname: searchRegex }
    ]
  }).select('username nickname profilePictureUrl isOnline lastSeen');
};

module.exports = mongoose.model('User', userSchema);