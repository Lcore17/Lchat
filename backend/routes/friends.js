const express = require('express');
const FriendRequest = require('../db/models/FriendRequest');
const User = require('../db/models/User');
const Conversation = require('../db/models/Conversation');
const auth = require('../middleware/auth');
const { validateRequest, friendRequestSchema } = require('../middleware/validation');

const router = express.Router();

// Send friend request
router.post('/request', auth, validateRequest(friendRequestSchema), async (req, res) => {
  try {
    const { toUserId, message } = req.body;
    const fromUserId = req.user._id;

    // Check if trying to add self
    if (fromUserId.toString() === toUserId) {
      return res.status(400).json({ message: 'You cannot send a friend request to yourself' });
    }

    // Check if target user exists
    const targetUser = await User.findById(toUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if friend request already exists
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { fromUserId, toUserId },
        { fromUserId: toUserId, toUserId: fromUserId }
      ]
    });

    if (existingRequest) {
      if (existingRequest.status === 'accepted') {
        return res.status(400).json({ message: 'You are already friends' });
      } else if (existingRequest.status === 'pending') {
        return res.status(400).json({ message: 'Friend request already sent' });
      } else if (existingRequest.status === 'rejected') {
        // Allow sending new request after rejection
        existingRequest.status = 'pending';
        existingRequest.message = message || '';
        await existingRequest.save();
        
        await existingRequest.populate('fromUserId toUserId', 'username nickname profilePictureUrl');
        
        return res.status(200).json({
          message: 'Friend request sent',
          friendRequest: existingRequest
        });
      }
    }

    // Create new friend request
    const friendRequest = new FriendRequest({
      fromUserId,
      toUserId,
      message: message || '',
      status: 'pending'
    });

    await friendRequest.save();
    await friendRequest.populate('fromUserId toUserId', 'username nickname profilePictureUrl');

      // Emit socket event to target user for real-time update
      const io = req.app.get('io');
      if (io && targetUser._id) {
        const socketId = io.connectedUsers?.get(targetUser._id.toString());
        if (socketId) {
          io.to(socketId).emit('friendRequestUpdate', { type: 'received', friendRequest });
        }
      }

      res.status(201).json({
        message: 'Friend request sent successfully',
        friendRequest
      });

  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ message: 'Failed to send friend request', error: error.message });
  }
});

// Accept friend request
router.post('/accept', auth, async (req, res) => {
  try {
    const { requestId } = req.body;

    const friendRequest = await FriendRequest.findOne({
      _id: requestId,
      toUserId: req.user._id,
      status: 'pending'
    });

    if (!friendRequest) {
      return res.status(404).json({ message: 'Friend request not found' });
    }

    // Update request status
    friendRequest.status = 'accepted';
    await friendRequest.save();

    // Create conversation between friends
    const conversation = await Conversation.createOrGet(
      friendRequest.fromUserId,
      friendRequest.toUserId
    );

    await friendRequest.populate('fromUserId toUserId', 'username nickname profilePictureUrl');

      // Emit socket event to both users for real-time update
      const io = req.app.get('io');
      if (io) {
        const fromSocketId = io.connectedUsers?.get(friendRequest.fromUserId._id.toString());
        const toSocketId = io.connectedUsers?.get(friendRequest.toUserId._id.toString());
        if (fromSocketId) {
          io.to(fromSocketId).emit('friendRequestUpdate', { type: 'accepted', friendRequest });
        }
        if (toSocketId) {
          io.to(toSocketId).emit('friendRequestUpdate', { type: 'accepted', friendRequest });
        }
      }

      res.json({
        message: 'Friend request accepted',
        friendRequest,
        conversation: {
          id: conversation._id,
          participants: conversation.participants
        }
      });

  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ message: 'Failed to accept friend request', error: error.message });
  }
});

// Reject friend request
router.post('/reject', auth, async (req, res) => {
  try {
    const { requestId } = req.body;

    const friendRequest = await FriendRequest.findOne({
      _id: requestId,
      toUserId: req.user._id,
      status: 'pending'
    });

    if (!friendRequest) {
      return res.status(404).json({ message: 'Friend request not found' });
    }

    friendRequest.status = 'rejected';
    await friendRequest.save();

    res.json({ message: 'Friend request rejected' });

  } catch (error) {
    console.error('Reject friend request error:', error);
    res.status(500).json({ message: 'Failed to reject friend request', error: error.message });
  }
});

// Get pending friend requests (received)
router.get('/requests', auth, async (req, res) => {
  try {
    const pendingRequests = await FriendRequest.getPendingRequests(req.user._id);

    res.json({
      requests: pendingRequests.map(request => ({
        id: request._id,
        from: {
          id: request.fromUserId._id,
          username: request.fromUserId.username,
          nickname: request.fromUserId.nickname,
          profilePictureUrl: request.fromUserId.profilePictureUrl,
          isOnline: request.fromUserId.isOnline,
          lastSeen: request.fromUserId.lastSeen
        },
        message: request.message,
        createdAt: request.createdAt
      }))
    });

  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({ message: 'Failed to get friend requests', error: error.message });
  }
});

// Get sent friend requests
router.get('/requests/sent', auth, async (req, res) => {
  try {
    const sentRequests = await FriendRequest.getSentRequests(req.user._id);

    res.json({
      requests: sentRequests.map(request => ({
        id: request._id,
        to: {
          id: request.toUserId._id,
          username: request.toUserId.username,
          nickname: request.toUserId.nickname,
          profilePictureUrl: request.toUserId.profilePictureUrl,
          isOnline: request.toUserId.isOnline,
          lastSeen: request.toUserId.lastSeen
        },
        message: request.message,
        status: request.status,
        createdAt: request.createdAt
      }))
    });

  } catch (error) {
    console.error('Get sent requests error:', error);
    res.status(500).json({ message: 'Failed to get sent requests', error: error.message });
  }
});

// Get friends list
router.get('/list', auth, async (req, res) => {
  try {
    const friends = await FriendRequest.getFriendsList(req.user._id);

    // Get conversations for each friend
    const friendsWithConversations = await Promise.all(
      friends.map(async (friend) => {
        const conversation = await Conversation.findBetweenUsers(req.user._id, friend._id);
        return {
          id: friend._id,
          username: friend.username,
          nickname: friend.nickname,
          profilePictureUrl: friend.profilePictureUrl,
          isOnline: friend.isOnline,
          lastSeen: friend.lastSeen,
          conversationId: conversation ? conversation._id : null,
          lastMessageText: conversation ? conversation.lastMessageText : '',
          lastMessageAt: conversation ? conversation.lastMessageAt : null
        };
      })
    );

    // Sort by last message time (most recent first)
    friendsWithConversations.sort((a, b) => {
      if (!a.lastMessageAt && !b.lastMessageAt) return 0;
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
    });

    res.json({
      friends: friendsWithConversations
    });

  } catch (error) {
    console.error('Get friends list error:', error);
    res.status(500).json({ message: 'Failed to get friends list', error: error.message });
  }
});

// Remove friend
router.delete('/remove/:friendId', auth, async (req, res) => {
  try {
    const { friendId } = req.params;
    const userId = req.user._id;

    const friendship = await FriendRequest.findOne({
      $or: [
        { fromUserId: userId, toUserId: friendId, status: 'accepted' },
        { fromUserId: friendId, toUserId: userId, status: 'accepted' }
      ]
    });

    if (!friendship) {
      return res.status(404).json({ message: 'Friendship not found' });
    }

    await FriendRequest.findByIdAndDelete(friendship._id);

    // Optionally deactivate the conversation
    const conversation = await Conversation.findBetweenUsers(userId, friendId);
    if (conversation) {
      conversation.isActive = false;
      await conversation.save();
    }

    res.json({ message: 'Friend removed successfully' });

  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ message: 'Failed to remove friend', error: error.message });
  }
});

// Check friendship status
router.get('/status/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    if (currentUserId.toString() === userId) {
      return res.json({ status: 'self' });
    }

    const friendship = await FriendRequest.findOne({
      $or: [
        { fromUserId: currentUserId, toUserId: userId },
        { fromUserId: userId, toUserId: currentUserId }
      ]
    });

    if (!friendship) {
      return res.json({ status: 'none' });
    }

    let status = friendship.status;
    if (status === 'pending') {
      // Determine if current user sent or received the request
      if (friendship.fromUserId.toString() === currentUserId.toString()) {
        status = 'sent';
      } else {
        status = 'received';
      }
    }

    res.json({ 
      status,
      requestId: friendship._id,
      createdAt: friendship.createdAt
    });

  } catch (error) {
    console.error('Check friendship status error:', error);
    res.status(500).json({ message: 'Failed to check friendship status', error: error.message });
  }
});

module.exports = router;