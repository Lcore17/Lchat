const mongoose = require('mongoose');

const shortformSchema = new mongoose.Schema({
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
    enum: ['common', 'internet', 'texting', 'social'],
    default: 'common'
  },
  usage: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

shortformSchema.index({ key: 1 });
shortformSchema.index({ category: 1 });

module.exports = mongoose.model('Shortform', shortformSchema);