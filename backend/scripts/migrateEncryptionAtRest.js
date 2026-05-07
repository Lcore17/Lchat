require('dotenv').config();

const mongoose = require('mongoose');
const Message = require('../db/models/Message');
const Conversation = require('../db/models/Conversation');
const { isEncrypted } = require('../utils/messageCrypto');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lchat';
const DRY_RUN = process.argv.includes('--dry-run');

function getRawValue(doc, path) {
  return doc.get(path, null, { getters: false });
}

function isEncryptableText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

async function migrateMessages() {
  let scanned = 0;
  let updated = 0;
  let alreadyEncrypted = 0;

  const cursor = Message.find({}).cursor();

  for await (const msg of cursor) {
    scanned += 1;
    let changed = false;

    const rawOriginal = getRawValue(msg, 'textOriginal');
    if (isEncryptableText(rawOriginal)) {
      if (isEncrypted(rawOriginal)) {
        alreadyEncrypted += 1;
      } else {
        msg.set('textOriginal', rawOriginal);
        changed = true;
      }
    }

    const rawPreprocessed = getRawValue(msg, 'textPreprocessed');
    if (isEncryptableText(rawPreprocessed)) {
      if (!isEncrypted(rawPreprocessed)) {
        msg.set('textPreprocessed', rawPreprocessed);
        changed = true;
      }
    }

    if (changed) {
      if (!DRY_RUN) {
        await msg.save({ validateBeforeSave: false });
      }
      updated += 1;
    }
  }

  return { scanned, updated, alreadyEncrypted };
}

async function migrateConversations() {
  let scanned = 0;
  let updated = 0;
  let alreadyEncrypted = 0;

  const cursor = Conversation.find({}).cursor();

  for await (const convo of cursor) {
    scanned += 1;

    const rawLastMessage = getRawValue(convo, 'lastMessageText');
    if (!isEncryptableText(rawLastMessage)) {
      continue;
    }

    if (isEncrypted(rawLastMessage)) {
      alreadyEncrypted += 1;
      continue;
    }

    convo.set('lastMessageText', rawLastMessage);
    if (!DRY_RUN) {
      await convo.save({ validateBeforeSave: false });
    }
    updated += 1;
  }

  return { scanned, updated, alreadyEncrypted };
}

async function main() {
  if (!process.env.MESSAGE_ENCRYPTION_KEY) {
    throw new Error('MESSAGE_ENCRYPTION_KEY is required before running migration');
  }

  console.log(`\n🔐 Message encryption migration started${DRY_RUN ? ' (dry-run)' : ''}`);
  console.log(`📦 Mongo URI: ${MONGO_URI}`);

  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const messageStats = await migrateMessages();
  const conversationStats = await migrateConversations();

  console.log('\n=== Migration summary ===');
  console.log('Messages:');
  console.log(`- Scanned: ${messageStats.scanned}`);
  console.log(`- Updated: ${messageStats.updated}`);
  console.log(`- Already encrypted: ${messageStats.alreadyEncrypted}`);
  console.log('Conversations:');
  console.log(`- Scanned: ${conversationStats.scanned}`);
  console.log(`- Updated: ${conversationStats.updated}`);
  console.log(`- Already encrypted: ${conversationStats.alreadyEncrypted}`);

  if (DRY_RUN) {
    console.log('\nℹ️ Dry-run mode: no database writes were made.');
  } else {
    console.log('\n✅ Migration completed and data encrypted at rest.');
  }
}

main()
  .catch((error) => {
    console.error('❌ Migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (_) {}
  });