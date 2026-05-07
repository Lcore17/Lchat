const express = require('express');
const router = express.Router();
const Tesseract = require('tesseract.js');
const path = require('path');

function cleanOcrText(rawText = '') {
  const normalized = String(rawText)
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[{}\[\]|`~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = normalized.split(' ').filter(Boolean);
  const filteredTokens = tokens.filter(token => {
    if (/^[^\p{L}\p{N}]+$/u.test(token)) return false;
    if (/^[\d]+([.,:;][\d]+)*$/u.test(token)) return false;
    if (/^[\d]+[.,:;]?[\d]*[)\]}]+$/u.test(token)) return false;
    if (/^[)\]}.,:;!?-]+$/.test(token)) return false;
    return true;
  });

  const sentenceLike = filteredTokens.join(' ').replace(/\s+/g, ' ').trim();
  return sentenceLike;
}

function buildBestOcrText(ocrData) {
  const lines = Array.isArray(ocrData?.lines) ? ocrData.lines : [];

  if (lines.length > 0) {
    const selected = lines
      .filter(line => {
        const confidence = Number(line?.confidence ?? 0);
        const text = String(line?.text || '').trim();
        return confidence >= 45 && /[\p{L}]/u.test(text);
      })
      .map(line => String(line.text || '').trim())
      .filter(Boolean);

    if (selected.length > 0) {
      return selected.join(' ');
    }
  }

  return String(ocrData?.text || '');
}

// POST /ocr/extract
router.post('/extract', async (req, res) => {
  try {
    // Expecting image path in req.body.imagePath
    const { imagePath } = req.body;
    if (!imagePath) {
      return res.status(400).json({ error: 'Image path required' });
    }
    const fullPath = path.join(__dirname, '../uploads/messages', imagePath);
    const result = await Tesseract.recognize(fullPath, 'eng');
    const bestRawText = buildBestOcrText(result?.data);
    const cleanedText = cleanOcrText(bestRawText);
    res.json({ text: cleanedText });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
