const express = require('express');
const router = express.Router();
const Tesseract = require('tesseract.js');
const path = require('path');

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
    res.json({ text: result.data.text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
