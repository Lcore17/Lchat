// models/Conversation.js
const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  type: {
    type: String,
    enum: ['private', 'group'],
    default: 'private'
  },
  name: {
    type: String,
    trim: true,
    maxlength: 100
  },
  avatar: {
    type: String,
    default: null
  },
  lastMessageText: {
    type: String,
    default: ''
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  lastMessageBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  settings: {
    autoTranslate: {
      type: Boolean,
      default: false
    },
    defaultLanguage: {
      type: String,
      enum: ['en', 'mr', 'te', 'ta','hi'],
      default: 'en'
    },
    notifications: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

// Index for efficient queries
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

// Static method to find conversation between users
conversationSchema.statics.findBetweenUsers = async function(userId1, userId2) {
  return this.findOne({
    participants: {
      $all: [userId1, userId2],
      $size: 2
    },
    type: 'private'
  }).populate('participants', 'username nickname profilePictureUrl isOnline lastSeen');
};

// Static method to create or get conversation between users
conversationSchema.statics.createOrGet = async function(userId1, userId2) {
  let conversation = await this.findBetweenUsers(userId1, userId2);
  
  if (!conversation) {
    conversation = await this.create({
      participants: [userId1, userId2],
      type: 'private'
    });
    await conversation.populate('participants', 'username nickname profilePictureUrl isOnline lastSeen');
  }
  
  return conversation;
};

// Static method to get user's conversations
conversationSchema.statics.getUserConversations = async function(userId) {
  return this.find({
    participants: userId,
    isActive: true
  })
  .populate('participants', 'username nickname profilePictureUrl isOnline lastSeen')
  .populate('lastMessageBy', 'username nickname')
  .sort({ lastMessageAt: -1 });
};

// Method to get other participant in private conversation
conversationSchema.methods.getOtherParticipant = function(currentUserId) {
  if (this.type === 'private') {
    return this.participants.find(p => p._id.toString() !== currentUserId.toString());
  }
  return null;
};

// Method to update last message info
conversationSchema.methods.updateLastMessage = async function(messageText, senderId) {
  this.lastMessageText = messageText;
  this.lastMessageAt = new Date();
  this.lastMessageBy = senderId;
  return this.save();
};

module.exports = mongoose.model('Conversation', conversationSchema);