// Define our supported languages and their full names for prompts
const languageMap = {
  en: 'English',
  hi: 'Hindi',
  mr: 'Marathi',
  te: 'Telugu',
  ta: 'Tamil',
};

const fs = require('fs');
const path = require('path');

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  out.push(current.trim());
  return out;
}

function readCsvPairs(csvPath) {
  if (!fs.existsSync(csvPath)) return [];

  const csv = fs.readFileSync(csvPath, 'utf8');
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const pairs = [];

  for (const line of lines) {
    const cols = parseCsvLine(line);
    if (cols.length < 2) continue;
    const src = cols[0].replace(/^"|"$/g, '').trim();
    const tgt = cols[1].replace(/^"|"$/g, '').trim();
    if (src && tgt) {
      pairs.push([src, tgt]);
    }
  }

  return pairs;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeForLookup(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(^[\s"'`([{]+)|([\s"'`\])}.,!?;:]+$)/g, '');
}

function lookupPhraseInCsv(text, sourceLang, targetLang) {
  try {
    if (!text || !sourceLang || !targetLang) return null;

    const pairFile = `${sourceLang}-${targetLang}.csv`;
    const csvPath = path.join(__dirname, '../data', pairFile);
    const input = normalizeForLookup(text);
    const pairs = readCsvPairs(csvPath);

    for (const [src, tgt] of pairs) {
      if (normalizeForLookup(src) === input) {
        return tgt;
      }
    }
  } catch (err) {
    return null;
  }
  return null;
}




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

  // --- Skip translation for file names ---
  const fileExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.pdf', '.mp3', '.wav', '.m4a', '.mp4', '.avi', '.mov', '.webm'];
  const fileKeywords = ['audio', 'image', 'attachment', 'file', 'document', 'photo', 'picture', 'video'];
  const lowerText = text.trim().toLowerCase();
  if (
    fileExtensions.some(ext => lowerText.endsWith(ext)) ||
    fileKeywords.some(keyword => lowerText.includes(keyword))
  ) {
    return { translatedText: text };
  }
  if (!text || !text.trim() || sourceLanguage === targetLanguage) {
    return { translatedText: text };
  }

  // --- Always check idioms first ---
  const idiom = await lookupCulturalIdiom(text, sourceLanguage, targetLanguage);
  if (idiom) {
    return { translatedText: idiom, from: 'idiom' };
  }

  // Strict phrase mapping from the exact source-target CSV pair
  const directCsvMatch = lookupPhraseInCsv(text, sourceLanguage, targetLanguage);
  if (directCsvMatch) {
    return { translatedText: directCsvMatch, from: 'csv' };
  }

  // Replace idioms embedded inside longer text before model translation.
  const idiomReplacedText = replaceIdiomsInText(text, sourceLanguage, targetLanguage);
  if (idiomReplacedText && normalizeForLookup(idiomReplacedText) !== normalizeForLookup(text)) {
    return { translatedText: idiomReplacedText, from: 'idiom-phrase' };
  }

  // --- Fallback translation ---
  const { localTranslate } = require('./localTranslator');

  let localResult;
  if (sourceLanguage === 'en' || targetLanguage === 'en') {
    localResult = await localTranslate(text, sourceLanguage, targetLanguage);
  } else {
    const intermediate = await localTranslate(text, sourceLanguage, 'en');
    localResult = await localTranslate(intermediate, 'en', targetLanguage);
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
  const teluguRegex = /[\u0C00-\u0C7F]/;
  const tamilRegex = /[\u0B80-\u0BFF]/;
  if (tamilRegex.test(text)) return { language: 'ta', confidence: 1 };
  if (teluguRegex.test(text)) return { language: 'te', confidence: 1 };
  if (hindiRegex.test(text)) {
    const normalized = text.toLowerCase();
    const marathiHints = ['आहे', 'नाही', 'मला', 'तुला', 'तुम्ही', 'काय', 'आहेत', 'करतो', 'करते', 'झाले'];
    const hindiHints = ['है', 'नहीं', 'मैं', 'तुम', 'आप', 'क्या', 'हूँ', 'हैं', 'करता', 'करती'];

    let mrScore = 0;
    let hiScore = 0;

    for (const hint of marathiHints) {
      if (normalized.includes(hint)) mrScore += 1;
    }
    for (const hint of hindiHints) {
      if (normalized.includes(hint)) hiScore += 1;
    }

    if (mrScore > hiScore) return { language: 'mr', confidence: 0.9 };
    if (hiScore > mrScore) return { language: 'hi', confidence: 0.9 };
    return { language: 'hi', confidence: 0.75 };
  }
  // Fallback to English
  return { language: 'en', confidence: 0.5 };
}

// --- Cultural idiom lookup helper ---
async function lookupCulturalIdiom(text, sourceLang, targetLang) {
  // Normalize input
  const input = normalizeForLookup(text);
  // Build idiom file path
  const idiomFile = `${sourceLang}-${targetLang}-idioms.csv`;
  const idiomPath = path.join(__dirname, '../data', idiomFile);
  try {
    const pairs = readCsvPairs(idiomPath);
    for (const [src, tgt] of pairs) {
      if (normalizeForLookup(src) === input) {
        return tgt;
      }
    }
  } catch (err) {
    console.warn('Cultural idiom file not found or unreadable:', idiomPath, err);
  }
  return null;
}

function replaceIdiomsInText(text, sourceLang, targetLang) {
  if (!text || !sourceLang || !targetLang) return null;

  const idiomFile = `${sourceLang}-${targetLang}-idioms.csv`;
  const idiomPath = path.join(__dirname, '../data', idiomFile);
  const idiomPairs = readCsvPairs(idiomPath)
    .map(([src, tgt]) => [normalizeForLookup(src), tgt])
    .filter(([src, tgt]) => src && tgt)
    .sort((a, b) => b[0].length - a[0].length);

  if (idiomPairs.length === 0) return null;

  let normalizedText = normalizeForLookup(text);
  let replaced = false;

  for (const [sourceIdiom, targetIdiom] of idiomPairs) {
    const pattern = new RegExp(`(^|\\s)${escapeRegex(sourceIdiom)}(?=$|\\s|[.,!?;:])`, 'gi');
    if (pattern.test(normalizedText)) {
      normalizedText = normalizedText.replace(pattern, (match, leading) => `${leading}${targetIdiom}`);
      replaced = true;
    }
  }

  return replaced ? normalizedText.replace(/\s+/g, ' ').trim() : null;
}

module.exports = {
  translateText,
  getSupportedLanguages,
  detectLanguage,
  lookupCulturalIdiom,
  lookupPhraseInCsv,
  normalizeForLookup,
};

