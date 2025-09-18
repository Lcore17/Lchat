const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const Story = require('../db/models/Story');

// PATCH /stories/:id/vote - vote on a poll option
router.patch('/:id/vote', auth, async (req, res) => {
  try {
    const { id } = req.params;
  let { optionId } = req.body;
  if (optionId === undefined || optionId === null) return res.status(400).json({ message: 'Missing optionId' });
  optionId = Number(optionId);
  if (isNaN(optionId)) return res.status(400).json({ message: 'Invalid optionId' });
    const story = await Story.findById(id);
    if (!story || !story.poll) return res.status(404).json({ message: 'Story or poll not found' });

    // Track votes per user in poll.votesByUser (add if not present)
    if (!story.poll.votesByUser) story.poll.votesByUser = {};
    const userId = req.user._id.toString();
    if (story.poll.votesByUser[userId]) {
      return res.status(400).json({ message: 'Already voted' });
    }

    // Find option and increment vote
    const option = story.poll.options.find(opt => opt.id === optionId);
    if (!option) return res.status(404).json({ message: 'Option not found' });
    option.votes = (option.votes || 0) + 1;
    story.poll.votesByUser[userId] = optionId;
    await story.save();

    // Return updated poll with user's votedOptionId
    const poll = {
      ...story.poll.toObject(),
      votedOptionId: optionId,
      options: story.poll.options.map(opt => ({ id: opt.id, text: opt.text, votes: opt.votes })),
    };
    res.json({ poll });
  } catch (err) {
    console.error('PATCH /stories/:id/vote error:', err);
    res.status(500).json({ message: 'Failed to vote' });
  }
});

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = 'uploads/stories';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `story-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

// GET /stories - get all stories (visible for 12h)
router.get('/', auth, async (req, res) => {
  try {
    const cutoff = Date.now() - 1000 * 60 * 60 * 12;
    // Delete expired stories
    await Story.deleteMany({ createdAt: { $lt: cutoff } });
    const docs = await Story.find({ createdAt: { $gte: cutoff } })
      .sort({ createdAt: -1 });

    // Get friends list for current user
    const FriendRequest = require('../db/models/FriendRequest');
    const friends = await FriendRequest.getFriendsList(req.user._id);
    const friendIds = friends.map(f => f._id.toString());

    // Only show stories from friends and self
    const stories = docs
      .filter(d => friendIds.includes(d.userId.toString()) || d.userId.toString() === req.user._id.toString())
      .map((d) => {
        const obj = d.toObject();
        obj.id = d._id;
        return obj;
      });
    res.json({ stories });
  } catch (err) {
    console.error('GET /stories error:', err);
    res.status(500).json({ message: 'Failed to fetch stories' });
  }
});

// POST /stories - add a story (text/photo/poll)
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    const { content } = req.body;
    let poll = undefined;
    if (req.body.poll) {
      poll = typeof req.body.poll === 'string' ? JSON.parse(req.body.poll) : req.body.poll;
    }
    let imageUri = null;
    if (req.file) {
      imageUri = `/uploads/stories/${req.file.filename}`;
    } else if (req.body.imageUri) {
      imageUri = req.body.imageUri;
    }

    const doc = await Story.create({
      userId: req.user._id,
      user: req.user.nickname || req.user.username,
      content: content || '',
      imageUri,
      createdAt: Date.now(),
      poll,
    });
    const story = { id: doc._id, ...doc.toObject() };
    res.json({ story });
  } catch (err) {
    console.error('POST /stories error:', err);
    res.status(500).json({ message: 'Failed to create story' });
  }
});

// DELETE /stories/:id - delete a story
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const story = await Story.findById(id);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    if (story.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not allowed to delete this story' });
    }

    // Remove file from disk if it's an uploaded file we control
    if (story.imageUri && story.imageUri.startsWith('/uploads/stories/')) {
      const filePath = path.join(process.cwd(), story.imageUri.replace(/^\//, ''));
      try {
        await fs.unlink(filePath);
      } catch (e) {
        // Ignore file not found
      }
    }

    await Story.deleteOne({ _id: id });
    res.json({ message: 'Story deleted' });
  } catch (err) {
    console.error('DELETE /stories/:id error:', err);
    res.status(500).json({ message: 'Failed to delete story' });
  }
});

module.exports = router;
