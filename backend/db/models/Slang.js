const mongoose = require('mongoose');

const slangSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  value: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['positive', 'negative', 'neutral', 'internet', 'youth'],
    default: 'neutral'
  },
  usage: {
    type: Number,
    default: 0
  },
  region: {
    type: String,
    default: 'global'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

slangSchema.index({ key: 1 });
slangSchema.index({ category: 1 });

module.exports = mongoose.model('Slang', slangSchema);