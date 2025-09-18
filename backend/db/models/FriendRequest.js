const mongoose = require('mongoose');

const friendRequestSchema = new mongoose.Schema({
  fromUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  toUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  message: {
    type: String,
    maxlength: 200,
    default: ''
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate friend requests
friendRequestSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true });
friendRequestSchema.index({ toUserId: 1, status: 1 });
friendRequestSchema.index({ fromUserId: 1, status: 1 });

// Static method to check if users are friends
friendRequestSchema.statics.areFriends = async function(userId1, userId2) {
  const friendship = await this.findOne({
    $or: [
      { fromUserId: userId1, toUserId: userId2, status: 'accepted' },
      { fromUserId: userId2, toUserId: userId1, status: 'accepted' }
    ]
  });
  return !!friendship;
};

// Static method to get user's friends list
friendRequestSchema.statics.getFriendsList = async function(userId) {
  const friendships = await this.find({
    $or: [
      { fromUserId: userId, status: 'accepted' },
      { toUserId: userId, status: 'accepted' }
    ]
  }).populate('fromUserId toUserId', 'username nickname profilePictureUrl isOnline lastSeen');

  // Extract friend user objects
  const friends = friendships.map(friendship => {
    if (friendship.fromUserId._id.toString() === userId.toString()) {
      return friendship.toUserId;
    } else {
      return friendship.fromUserId;
    }
  });

  return friends;
};

// Static method to get pending friend requests received
friendRequestSchema.statics.getPendingRequests = async function(userId) {
  return this.find({
    toUserId: userId,
    status: 'pending'
  }).populate('fromUserId', 'username nickname profilePictureUrl isOnline lastSeen');
};

// Static method to get sent friend requests
friendRequestSchema.statics.getSentRequests = async function(userId) {
  return this.find({
    fromUserId: userId,
    status: 'pending'
  }).populate('toUserId', 'username nickname profilePictureUrl isOnline lastSeen');
};

module.exports = mongoose.model('FriendRequest', friendRequestSchema);