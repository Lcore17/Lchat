const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import models
const User = require('../db/models/User');
const Shortform = require('../db/models/Shortform');
const Slang = require('../db/models/Slang');
const Conversation = require('../db/models/Conversation');
const Message = require('../db/models/Message');
const FriendRequest = require('../db/models/FriendRequest');

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/lchat';

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function loadJSONFile(filename) {
  try {
    const filePath = path.join(__dirname, '../db/seeds', filename);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`❌ Error loading ${filename}:`, error.message);
    return [];
  }
}

async function hashPasswords(users) {
  const hashedUsers = [];
  for (const user of users) {
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(user.passwordHash, salt);
    hashedUsers.push({
      ...user,
      passwordHash: hashedPassword
    });
  }
  return hashedUsers;
}

async function seedUsers() {
  try {
    console.log('🔄 Seeding users...');
    
    const users = await loadJSONFile('users.json');
    if (users.length === 0) return;

    // Hash passwords
    const hashedUsers = await hashPasswords(users);

    for (const userData of hashedUsers) {
      await User.findOneAndUpdate(
        { email: userData.email },
        userData,
        { upsert: true, new: true }
      );
    }

    console.log(`✅ Seeded ${hashedUsers.length} users`);
  } catch (error) {
    console.error('❌ Error seeding users:', error.message);
  }
}

async function seedShortforms() {
  try {
    console.log('🔄 Seeding shortforms...');
    
    const shortforms = await loadJSONFile('shortforms.json');
    if (shortforms.length === 0) return;

    for (const shortformData of shortforms) {
      await Shortform.findOneAndUpdate(
        { key: shortformData.key },
        shortformData,
        { upsert: true, new: true }
      );
    }

    console.log(`✅ Seeded ${shortforms.length} shortforms`);
  } catch (error) {
    console.error('❌ Error seeding shortforms:', error.message);
  }
}

async function seedSlangs() {
  try {
    console.log('🔄 Seeding slangs...');
    
    const slangs = await loadJSONFile('slangs.json');
    if (slangs.length === 0) return;

    for (const slangData of slangs) {
      await Slang.findOneAndUpdate(
        { key: slangData.key },
        slangData,
        { upsert: true, new: true }
      );
    }

    console.log(`✅ Seeded ${slangs.length} slangs`);
  } catch (error) {
    console.error('❌ Error seeding slangs:', error.message);
  }
}

async function seedConversations() {
  try {
    console.log('🔄 Seeding conversations...');
    
    const conversations = await loadJSONFile('conversations.json');
    if (conversations.length === 0) return;

    for (const conversationData of conversations) {
      await Conversation.findOneAndUpdate(
        { _id: conversationData._id },
        conversationData,
        { upsert: true, new: true }
      );
    }

    console.log(`✅ Seeded ${conversations.length} conversations`);
  } catch (error) {
    console.error('❌ Error seeding conversations:', error.message);
  }
}

async function seedMessages() {
  try {
    console.log('🔄 Seeding messages...');
    
    const messages = await loadJSONFile('messages.json');
    if (messages.length === 0) return;

    for (const messageData of messages) {
      await Message.findOneAndUpdate(
        { _id: messageData._id },
        messageData,
        { upsert: true, new: true }
      );
    }

    console.log(`✅ Seeded ${messages.length} messages`);
  } catch (error) {
    console.error('❌ Error seeding messages:', error.message);
  }
}

async function seedFriendRequests() {
  try {
    console.log('🔄 Seeding friend requests...');
    
    // Create some sample friend requests
    const friendRequests = [
      {
        fromUserId: '507f1f77bcf86cd799439011', // John
        toUserId: '507f1f77bcf86cd799439012',   // Jane
        status: 'accepted',
        message: 'Hey Jane, let\'s connect!'
      },
      {
        fromUserId: '507f1f77bcf86cd799439012', // Jane
        toUserId: '507f1f77bcf86cd799439013',   // Bob
        status: 'accepted',
        message: 'Hi Bob, found you through mutual friends!'
      },
      {
        fromUserId: '507f1f77bcf86cd799439013', // Bob
        toUserId: '507f1f77bcf86cd799439011',   // John
        status: 'pending',
        message: 'Hey John, want to be friends?'
      }
    ];

    for (const friendRequestData of friendRequests) {
      await FriendRequest.findOneAndUpdate(
        { 
          fromUserId: friendRequestData.fromUserId,
          toUserId: friendRequestData.toUserId
        },
        friendRequestData,
        { upsert: true, new: true }
      );
    }

    console.log(`✅ Seeded ${friendRequests.length} friend requests`);
  } catch (error) {
    console.error('❌ Error seeding friend requests:', error.message);
  }
}

async function createIndexes() {
  try {
    console.log('🔄 Creating database indexes...');
    
    // User indexes
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await User.collection.createIndex({ username: 1 }, { unique: true });
    await User.collection.createIndex({ username: 'text', nickname: 'text' });
    
    // Friend request indexes
    await FriendRequest.collection.createIndex({ fromUserId: 1, toUserId: 1 }, { unique: true });
    await FriendRequest.collection.createIndex({ toUserId: 1, status: 1 });
    
    // Conversation indexes
    await Conversation.collection.createIndex({ participants: 1 });
    await Conversation.collection.createIndex({ lastMessageAt: -1 });
    
    // Message indexes
    await Message.collection.createIndex({ conversationId: 1, timestamp: -1 });
    await Message.collection.createIndex({ senderId: 1 });
    
    console.log('✅ Database indexes created');
  } catch (error) {
    console.error('❌ Error creating indexes:', error.message);
  }
}

async function runSeed() {
  try {
    console.log('🚀 Starting database seeding...\n');
    
    await connectDB();
    
    // Seed all collections
    await seedUsers();
    await seedShortforms();
    await seedSlangs();
    await seedConversations();
    await seedMessages();
    await seedFriendRequests();
    
    // Create indexes
    await createIndexes();
    
    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📋 Seeded data summary:');
    console.log('   - 3 sample users (john@example.com, jane@example.com, bob@example.com)');
    console.log('   - 15 shortforms (idk, brb, lol, etc.)');
    console.log('   - 15 slang terms (lit, fire, sick, etc.)');
    console.log('   - 2 conversations between friends');
    console.log('   - 5 sample messages with preprocessing examples');
    console.log('   - 3 friend requests (2 accepted, 1 pending)');
    console.log('\n🔑 Test login credentials:');
    console.log('   - john@example.com / password123');
    console.log('   - jane@example.com / password123');
    console.log('   - bob@example.com / password123');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('LChat Database Seeder\n');
  console.log('Usage: node seed.js [options]\n');
  console.log('Options:');
  console.log('  --uri <uri>    MongoDB connection URI (default: from .env or localhost)');
  console.log('  --help, -h     Show this help message');
  process.exit(0);
}

const uriIndex = args.indexOf('--uri');
if (uriIndex !== -1 && args[uriIndex + 1]) {
  process.env.MONGO_URI = args[uriIndex + 1];
}

// Run the seeder
runSeed();