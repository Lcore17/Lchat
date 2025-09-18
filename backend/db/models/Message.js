const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  textOriginal: {
    type: String,
    required: true,
    maxlength: 4000
  },
  textPreprocessed: {
    type: String,
    maxlength: 4000
  },
  // Removed: textTranslated, targetLanguage, isTranslated
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'system', 'audio'],
    default: 'text'
  },
  fileUrl: {
    type: String,
    default: null
  },
  fileName: {
    type: String,
    default: null
  },
  fileSize: {
    type: Number,
    default: null
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  reactions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  editedAt: {
    type: Date,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  metadata: {
    preprocessingFlags: {
      hadShortforms: { type: Boolean, default: false },
      hadSlang: { type: Boolean, default: false },
      hadSarcasm: { type: Boolean, default: false }
    },
    translationConfidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null
    }
  },
  sentiment: {
    type: String,
    enum: ['positive', 'neutral', 'negative'],
    default: 'neutral'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
messageSchema.index({ conversationId: 1, timestamp: -1 });
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });

// Static method to get conversation messages with pagination
messageSchema.statics.getConversationMessages = async function(conversationId, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  return this.find({ 
    conversationId,
    isDeleted: false 
  })
  .populate('senderId', 'username nickname profilePictureUrl')
  .populate('replyTo', 'textOriginal senderId timestamp')
  .sort({ timestamp: -1 })
  .skip(skip)
  .limit(limit);
};

// Method to mark message as read by user
messageSchema.methods.markAsRead = async function(userId) {
  const alreadyRead = this.readBy.some(read => read.userId.toString() === userId.toString());
  if (!alreadyRead) {
    this.readBy.push({ userId, readAt: new Date() });
    return this.save();
  }
  return this;
};

// Method to add reaction
messageSchema.methods.addReaction = async function(userId, emoji) {
  this.reactions = this.reactions.filter(r => r.userId.toString() !== userId.toString());
  this.reactions.push({ userId, emoji, createdAt: new Date() });
  return this.save();
};

// Method to remove reaction
messageSchema.methods.removeReaction = async function(userId) {
  this.reactions = this.reactions.filter(r => r.userId.toString() !== userId.toString());
  return this.save();
};

// Method to soft delete message
messageSchema.methods.softDelete = async function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Message', messageSchema);