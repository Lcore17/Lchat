const Shortform = require('../db/models/Shortform');
const Slang = require('../db/models/Slang');
const { detectSarcasm } = require('./sarcasm');

// Load shortforms and slang from database (with fallback to JSON files)
let shortformsCache = null;
let slangCache = null;
let lastCacheUpdate = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function loadShortforms() {
  try {
    const shortforms = await Shortform.find({ isActive: true });
    const shortformsMap = {};
    shortforms.forEach(sf => {
      shortformsMap[sf.key.toLowerCase()] = sf.value;
    });
    return shortformsMap;
  } catch (error) {
    console.error('Failed to load shortforms from DB:', error);
    // Fallback to hardcoded shortforms
    return {
      'idk': 'I don\'t know',
      'brb': 'be right back',
      'lol': 'laugh out loud',
      'omg': 'oh my god',
      'tbh': 'to be honest',
      'imo': 'in my opinion',
      'imho': 'in my humble opinion',
      'btw': 'by the way',
      'fyi': 'for your information',
      'asap': 'as soon as possible',
      'ttyl': 'talk to you later',
      'gtg': 'got to go'
    };
  }
}

async function loadSlang() {
  try {
    const slangs = await Slang.find({ isActive: true });
    const slangMap = {};
    slangs.forEach(sl => {
      slangMap[sl.key.toLowerCase()] = sl.value;
    });
    return slangMap;
  } catch (error) {
    console.error('Failed to load slang from DB:', error);
    // Fallback to hardcoded slang
    return {
      'lit': 'amazing',
      'fire': 'excellent',
      'sick': 'awesome',
      'dope': 'cool',
      'savage': 'ruthless',
      'salty': 'bitter',
      'flex': 'show off',
      'stan': 'admire',
      'vibe': 'feeling',
      'lowkey': 'somewhat',
      'highkey': 'definitely',
      'periodt': 'period'
    };
  }
}

async function refreshCache() {
  const now = Date.now();
  if (!shortformsCache || !slangCache || (now - lastCacheUpdate > CACHE_DURATION)) {
    shortformsCache = await loadShortforms();
    slangCache = await loadSlang();
    lastCacheUpdate = now;
  }
}

// Expand shortforms in text
function expandShortforms(text, shortformsMap) {
  let processedText = text;
  let hadShortforms = false;

  // Use word boundaries to ensure we only replace whole words
  Object.keys(shortformsMap).forEach(shortform => {
    const regex = new RegExp(`\\b${shortform}\\b`, 'gi');
    if (regex.test(processedText)) {
      processedText = processedText.replace(regex, shortformsMap[shortform]);
      hadShortforms = true;
    }
  });

  return { text: processedText, hadShortforms };
}

// Replace slang terms
function replaceSlang(text, slangMap) {
  let processedText = text;
  let hadSlang = false;

  // Use word boundaries to ensure we only replace whole words
  Object.keys(slangMap).forEach(slangTerm => {
    const regex = new RegExp(`\\b${slangTerm}\\b`, 'gi');
    if (regex.test(processedText)) {
      processedText = processedText.replace(regex, slangMap[slangTerm]);
      hadSlang = true;
    }
  });

  return { text: processedText, hadSlang };
}

// Main preprocessing function
async function preprocessText(text) {
  try {
    await refreshCache();

    let processedText = text.trim();
    const flags = {
      hadShortforms: false,
      hadSlang: false,
      hadSarcasm: false
    };

    // Step 1: Expand shortforms
    const shortformResult = expandShortforms(processedText, shortformsCache);
    processedText = shortformResult.text;
    flags.hadShortforms = shortformResult.hadShortforms;

    // Step 2: Replace slang
    const slangResult = replaceSlang(processedText, slangCache);
    processedText = slangResult.text;
    flags.hadSlang = slangResult.hadSlang;

    // Step 3: Detect sarcasm
    const sarcasmResult = await detectSarcasm(processedText);
    flags.hadSarcasm = sarcasmResult.isSarcastic;

    // If sarcasm detected, append indicator
    if (flags.hadSarcasm) {
      processedText = processedText + ' [sarcasm]';
    }

    // Update usage statistics in database (fire and forget)
    if (flags.hadShortforms || flags.hadSlang) {
      updateUsageStats(text, flags).catch(err => 
        console.error('Failed to update usage stats:', err)
      );
    }

    return {
      original: text,
      processed: processedText,
      flags
    };

  } catch (error) {
    console.error('Preprocessing error:', error);
    return {
      original: text,
      processed: text,
      flags: {
        hadShortforms: false,
        hadSlang: false,
        hadSarcasm: false
      }
    };
  }
}

// Update usage statistics (optional background task)
async function updateUsageStats(text, flags) {
  try {
    if (flags.hadShortforms) {
      const words = text.toLowerCase().split(/\s+/);
      const shortformKeys = Object.keys(shortformsCache);
      
      for (const word of words) {
        if (shortformKeys.includes(word)) {
          await Shortform.updateOne(
            { key: word },
            { $inc: { usage: 1 } }
          );
        }
      }
    }

    if (flags.hadSlang) {
      const words = text.toLowerCase().split(/\s+/);
      const slangKeys = Object.keys(slangCache);
      
      for (const word of words) {
        if (slangKeys.includes(word)) {
          await Slang.updateOne(
            { key: word },
            { $inc: { usage: 1 } }
          );
        }
      }
    }
  } catch (error) {
    console.error('Error updating usage stats:', error);
  }
}

// Test function for preprocessing
async function testPreprocessing() {
  const testCases = [
    "idk but this party was lit!",
    "omg that's so fire, no cap!",
    "brb, gonna flex on my haters",
    "Yeah, I'm totally excited about this meeting... NOT!",
    "sure, working on weekends is just fantastic 🙄"
  ];

  for (const testCase of testCases) {
    console.log('\nOriginal:', testCase);
    const result = await preprocessText(testCase);
    console.log('Processed:', result.processed);
    console.log('Flags:', result.flags);
  }
}

module.exports = {
  preprocessText,
  expandShortforms,
  replaceSlang,
  testPreprocessing
};