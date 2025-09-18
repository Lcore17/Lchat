// This line MUST be the very first line to run.
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Route and Model imports
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const friendRoutes = require('./routes/friends');
const messageRoutes = require('./routes/messages');
const translationRoutes = require('./routes/translation'); // This is now used for on-demand translation
const ocrRoutes = require('./routes/ocr');
const audioRoutes = require('./routes/audio');
const Message = require('./db/models/Message');
const Conversation = require('./db/models/Conversation');
const User = require('./db/models/User');

const storiesRouter = require('./routes/stories');

const app = express();
const server = http.createServer(app);

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:19006'];
const io = socketIo(server, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});
// Expose io and connectedUsers on app for route access
const connectedUsers = new Map();
app.set('io', io);
io.connectedUsers = connectedUsers;

// Middleware setup
app.use(helmet());
app.use(cors({ origin: corsOrigins, credentials: true }));
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
});
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static('uploads'));

// OCR & Audio API
app.use('/ocr', ocrRoutes);
app.use('/audio', audioRoutes);

// Database connection
mongoose
  .connect('mongodb://127.0.0.1:27017/lchat', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// API Routes
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/friends', friendRoutes);
app.use('/messages', messageRoutes);
app.use('/translate', translationRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'healthy' }));

app.use('/stories', storiesRouter);

// Socket.IO Logic
io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;
  if (userId) {
    socket.userId = userId;
    console.log(`✅ User ${userId} successfully authenticated on socket ${socket.id}`);
    connectedUsers.set(userId.toString(), socket.id);
    User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: new Date(),
    }).catch(console.error);
    socket.broadcast.emit('user_online', { userId, isOnline: true });
  }

  socket.on('joinConversation', (conversationId) => {
    socket.join(conversationId);
    console.log(`📱 User ${socket.userId} joined conversation ${conversationId}`);
  });

  socket.on('leaveConversation', (conversationId) => {
    socket.leave(conversationId);
    console.log(`👋 User ${socket.userId} left conversation ${conversationId}`);
  });

  // --- ✅ SIMPLIFIED MESSAGE HANDLER (NO AUTOMATIC TRANSLATION) ---
  socket.on('sendMessage', async (data) => {
    try {
      const senderId = socket.userId;
      const { conversationId, text } = data;

      if (!senderId) {
        return console.error("sendMessage Error: User not authenticated on this socket.");
      }
      if (!conversationId || !text) {
        return console.error("sendMessage Error: Missing conversationId or text.");
      }

      // Improved sentiment analysis: split into sentences, analyze each, aggregate
      const Sentiment = require('sentiment');
      const sentiment = new Sentiment();
      // Algorithmic approach: split into sentences, score each, bias toward neutral for formal/business language
      const sentences = text.match(/[^.!?]+[.!?]?/g) || [text];
      let totalScore = 0;
      let sentenceCount = 0;
      let nonZeroSentences = 0;
      sentences.forEach(sentence => {
        const result = sentiment.analyze(sentence.trim());
        totalScore += result.score;
        if (result.score !== 0) nonZeroSentences++;
        sentenceCount++;
      });
      // If most sentences are scored zero, treat as neutral (business/formal)
      let sentimentLabel = 'neutral';
      const avgScore = totalScore / sentenceCount;
      if (nonZeroSentences === 0 || Math.abs(avgScore) < 0.8) {
        sentimentLabel = 'neutral';
      } else if (avgScore > 0.8) {
        sentimentLabel = 'positive';
      } else if (avgScore < -0.8) {
        sentimentLabel = 'negative';
      }

      // 1. Create and save the new message with sentiment
      const newMessage = new Message({
        conversationId,
        senderId,
        textOriginal: text,
        timestamp: new Date(),
        sentiment: sentimentLabel
      });
      await newMessage.save();

      // 2. Update the conversation's last message
      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessageText: text,
        lastMessageAt: newMessage.timestamp,
        lastMessageBy: senderId,
      });

      // 3. Populate sender info and broadcast the new message object
      const messageForBroadcast = await Message.findById(newMessage._id).populate('senderId', 'nickname profilePictureUrl');
      
      socket.broadcast.to(conversationId).emit('newMessage', messageForBroadcast);
      console.log(`💬 Message from ${senderId} saved and broadcasted with sentiment: ${sentimentLabel}`);

    } catch (error) {
      console.error('❌ FATAL ERROR in sendMessage handler:', error);
    }
  });

  socket.on('disconnect', async () => {
    if (socket.userId) {
      try {
        await User.findByIdAndUpdate(socket.userId, {
          isOnline: false,
          lastSeen: new Date(),
        });
        socket.broadcast.emit('user_online', {
          userId: socket.userId,
          isOnline: false,
        });
        connectedUsers.delete(socket.userId.toString());
        console.log(`👋 User ${socket.userId} disconnected`);
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    }
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

app.use('*', (req, res) =>
  res.status(404).json({ message: 'API endpoint not found' })
);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = { app, server, io };