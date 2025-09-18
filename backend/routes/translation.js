const express = require('express');
const auth = require('../middleware/auth');
const { validateRequest, translateSchema } = require('../middleware/validation');
const { preprocessText } = require('../utils/preprocess');
const { translateText } = require('../utils/translate');

const router = express.Router();

// Translate text with preprocessing
router.post('/', auth, validateRequest(translateSchema), async (req, res) => {
  try {
    const { text, targetLanguage, enablePreprocessing = true } = req.body;

    let processedText = text;
    let preprocessingFlags = {
      hadShortforms: false,
      hadSlang: false,
      hadSarcasm: false
    };

    // Preprocess text if enabled
    if (enablePreprocessing) {
      const preprocessResult = await preprocessText(text);
      processedText = preprocessResult.processed;
      preprocessingFlags = preprocessResult.flags;
    }

    // Auto-detect source language
    const { detectLanguage } = require('../utils/translate');
    let detectedLanguage = 'en';
    try {
      const detectionResult = await detectLanguage(processedText);
      detectedLanguage = detectionResult.language || 'en';
    } catch (err) {
      console.warn('Language detection failed, defaulting to en:', err);
    }

    // Translate text using detected source language
    const translationResult = await translateText(processedText, targetLanguage, detectedLanguage);

    // --- CSV update logic ---
    // Only update if translation is new (not same as input)
    if (
      translationResult.translatedText &&
      translationResult.translatedText.trim().toLowerCase() !== processedText.trim().toLowerCase()
    ) {
      // Check if already present in CSV
      const fs = require('fs');
      const path = require('path');
      const csvFile = `${detectedLanguage}-${targetLanguage}.csv`;
      const csvPath = path.join(__dirname, '../data', csvFile);
      let found = false;
      try {
        if (fs.existsSync(csvPath)) {
          const csv = fs.readFileSync(csvPath, 'utf8');
          const lines = csv.split(/\r?\n/);
          for (const line of lines) {
            const [src, tgt] = line.split(',').map(s => s.replace(/^"|"$/g, '').trim());
            if (src && src.toLowerCase() === processedText.trim().toLowerCase()) {
              found = true;
              break;
            }
          }
        }
        if (!found) {
          // Append new translation
          fs.appendFileSync(csvPath, `"${processedText.trim()}","${translationResult.translatedText.trim()}"\n`);
        }
      } catch (err) {
        // If file doesn't exist, create it
        fs.writeFileSync(csvPath, `"${processedText.trim()}","${translationResult.translatedText.trim()}"\n`);
      }
    }

    res.json({
      original: text,
      preprocessed: processedText,
      translated: translationResult.translatedText,
      targetLanguage,
      confidence: translationResult.confidence,
      preprocessing: preprocessingFlags,
      detectedLanguage
    });

  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ 
      message: 'Translation failed', 
      error: error.message,
      // Fallback response
      original: req.body.text,
      preprocessed: req.body.text,
      translated: req.body.text,
      targetLanguage: req.body.targetLanguage,
      confidence: 0,
      preprocessing: {
        hadShortforms: false,
        hadSlang: false,
        hadSarcasm: false
      },
      detectedLanguage: 'en'
    });
  }
});

// Get supported languages
router.get('/languages', auth, async (req, res) => {
  try {
    const supportedLanguages = [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
      { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
      { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
      { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' }
    ];

    res.json({ languages: supportedLanguages });
  } catch (error) {
    console.error('Get languages error:', error);
    res.status(500).json({ message: 'Failed to get languages', error: error.message });
  }
});

// Detect language of text
router.post('/detect', auth, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ message: 'Text is required' });
    }

    const { detectLanguage } = require('../utils/translate');
    const detectionResult = await detectLanguage(text);

    res.json({
      detectedLanguage: detectionResult.language,
      confidence: detectionResult.confidence
    });

  } catch (error) {
    console.error('Language detection error:', error);
    res.status(500).json({ 
      message: 'Language detection failed', 
      error: error.message,
      detectedLanguage: 'en',
      confidence: 0
    });
  }
});

module.exports = router;