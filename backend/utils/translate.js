// Define our supported languages and their full names for prompts
const languageMap = {
  en: 'English',
  hi: 'Hindi',
  mr: 'Marathi',
  te: 'Telugu',
  ta: 'Tamil',
};




/**
 * The main translation function. It uses only local mapping and logic for translation.
 * @param {string} text The text to translate.
 * @param {string} targetLanguage The target language code (e.g., 'mr').
 * @param {string} sourceLanguage The source language code (e.g., 'hi').
 * @returns {Promise<{translatedText: string}>}
 */
async function translateText(text, targetLanguage = 'en', sourceLanguage = 'en') {
  let enableCulturalAdaptation = false;
  let options = {};
  if (typeof targetLanguage === 'object') {
    options = targetLanguage;
    targetLanguage = options.targetLanguage || 'en';
    sourceLanguage = options.sourceLanguage || 'en';
    enableCulturalAdaptation = !!options.culturalAdaptation;
  }
  if (!text || !text.trim() || sourceLanguage === targetLanguage) {
    return { translatedText: text };
  }

  // --- Always check idioms first ---
  const idiom = await lookupCulturalIdiom(text, sourceLanguage, targetLanguage);
  if (idiom) {
    return { translatedText: idiom };
  }

  // --- Parallel phrase and local translation ---
  const fs = require('fs');
  const path = require('path');
  function getPhraseFromCSV(text, sourceLang, targetLang) {
    try {
      let csvFile = null;
      // Dynamically support all language pairs present in data folder
      const files = fs.readdirSync(path.join(__dirname, '../data'));
      const pairFile = files.find(f => f === `${sourceLang}-${targetLang}.csv`);
      if (!pairFile) return null;
      const csvPath = path.join(__dirname, '../data', pairFile);
      const csv = fs.readFileSync(csvPath, 'utf8');
      const lines = csv.split(/\r?\n/);
      for (const line of lines) {
        const [src, tgt] = line.split(',').map(s => s.replace(/^"|"$/g, '').trim());
        if (src && tgt && src.toLowerCase() === text.trim().toLowerCase()) {
          return tgt;
        }
      }
    } catch (err) {
      return null;
    }
    return null;
  }
  const { localTranslate } = require('./localTranslator');

  const phrasePromise = Promise.resolve(getPhraseFromCSV(text, sourceLanguage, targetLanguage));
  let localPromise;
  if (sourceLanguage === 'en' || targetLanguage === 'en') {
    localPromise = localTranslate(text, sourceLanguage, targetLanguage);
  } else {
    localPromise = localTranslate(text, sourceLanguage, 'en').then(intermediate => localTranslate(intermediate, 'en', targetLanguage));
  }

  const [phrase, localResult] = await Promise.all([phrasePromise, localPromise]);

  // Priority: phrase > local
  if (phrase) {
    return { translatedText: phrase };
  }
  if (localResult && localResult.trim().toLowerCase() !== text.trim().toLowerCase()) {
    return { translatedText: localResult };
  }
  // If nothing found, return original text
  return { translatedText: text };
}


// This function is still needed for your frontend API.
async function getSupportedLanguages() {
  return [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'mr', name: 'Marathi' },
    { code: 'te', name: 'Telugu' },
    { code: 'ta', name: 'Tamil' }
  ];
}

/**
 * Detect language using simple heuristics (no API)
 * @param {string} text
 * @returns {Promise<{language: string, confidence: number}>}
 */
async function detectLanguage(text) {
  // Simple heuristic: check for unique script/words
  const hindiRegex = /[\u0900-\u097F]/;
  const marathiRegex = /[\u0900-\u097F]/;
  const teluguRegex = /[\u0C00-\u0C7F]/;
  const tamilRegex = /[\u0B80-\u0BFF]/;
  if (tamilRegex.test(text)) return { language: 'ta', confidence: 1 };
  if (teluguRegex.test(text)) return { language: 'te', confidence: 1 };
  if (hindiRegex.test(text)) {
    // Could be Hindi or Marathi, fallback to Hindi
    return { language: 'hi', confidence: 0.8 };
  }
  // Fallback to English
  return { language: 'en', confidence: 0.5 };
}

// --- Cultural idiom lookup helper ---
const fs = require('fs');
const path = require('path');

async function lookupCulturalIdiom(text, sourceLang, targetLang) {
  // Normalize input
  const input = text.trim().toLowerCase();
  // Build idiom file path
  let idiomFile = null;
  if (sourceLang === 'en' && targetLang === 'hi') idiomFile = 'en-hi-idioms.csv';
  if (sourceLang === 'en' && targetLang === 'mr') idiomFile = 'en-mr-idioms.csv';
  if (sourceLang === 'en' && targetLang === 'ta') idiomFile = 'en-ta-idioms.csv';
  if (sourceLang === 'en' && targetLang === 'te') idiomFile = 'en-te-idioms.csv';
  if (sourceLang === 'mr' && targetLang === 'en') idiomFile = 'mr-en-idioms.csv';
  if (sourceLang === 'hi' && targetLang === 'en') idiomFile = 'hi-en-idioms.csv';
  if (sourceLang === 'ta' && targetLang === 'en') idiomFile = 'ta-en-idioms.csv';
  if (sourceLang === 'te' && targetLang === 'en') idiomFile = 'te-en-idioms.csv';
  if (!idiomFile) return null;
  const idiomPath = path.join(__dirname, '../data', idiomFile);
  try {
    const csv = fs.readFileSync(idiomPath, 'utf8');
    const lines = csv.split(/\r?\n/);
    for (const line of lines) {
      const [src, tgt] = line.split(',').map(s => s.replace(/^"|"$/g, '').trim());
      if (src && tgt && src.toLowerCase() === input) {
        return tgt;
      }
    }
  } catch (err) {
    console.warn('Cultural idiom file not found or unreadable:', idiomPath, err);
  }
  return null;
}

module.exports = {
  translateText,
  getSupportedLanguages,
  detectLanguage,
  lookupCulturalIdiom,
};

