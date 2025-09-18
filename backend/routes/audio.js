const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { localTranslate } = require('../utils/localTranslator');

// POST /audio/transcribe-and-translate
// { audioPath: 'msg-xxxx.m4a', targetLanguage: 'hi' }
router.post('/transcribe-and-translate', async (req, res) => {
	try {
		const { audioPath, targetLanguage } = req.body;
		if (!audioPath || !targetLanguage) {
			return res.status(400).json({ error: 'audioPath and targetLanguage required' });
		}
		const fullPath = path.join(__dirname, '../uploads/messages', audioPath);
		if (!fs.existsSync(fullPath)) {
			return res.status(404).json({ error: 'Audio file not found' });
		}

		// Example: Send to AssemblyAI STT API (replace with your API key and endpoint)
		const apiKey = process.env.ASSEMBLYAI_API_KEY;
		if (!apiKey) {
			console.error('[audio] Missing ASSEMBLYAI_API_KEY');
			return res.status(500).json({ error: 'STT API key not configured' });
		}

		// Upload audio to AssemblyAI
		const uploadRes = await axios({
			method: 'post',
			url: 'https://api.assemblyai.com/v2/upload',
			headers: { 'authorization': apiKey },
			data: fs.createReadStream(fullPath),
		});
		const audioUrl = uploadRes.data.upload_url;

		// Request transcription
		const transcribeRes = await axios({
			method: 'post',
			url: 'https://api.assemblyai.com/v2/transcript',
			headers: { 'authorization': apiKey },
			data: {
				audio_url: audioUrl,
				language_detection: true
			},
		});
		const transcriptId = transcribeRes.data.id;

		// Poll for transcript completion
		let transcriptText = '';
		let detectedLang = 'en';
		for (let i = 0; i < 20; i++) {
			await new Promise(r => setTimeout(r, 3000));
			const pollRes = await axios({
				method: 'get',
				url: `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
				headers: { 'authorization': apiKey },
			});
			if (pollRes.data.status === 'completed') {
				transcriptText = pollRes.data.text;
				detectedLang = pollRes.data.language_code || detectedLang;
				break;
			} else if (pollRes.data.status === 'failed') {
				return res.status(500).json({ error: 'Transcription failed' });
			}
		}
		if (!transcriptText) return res.status(500).json({ error: 'Transcription timed out' });

		// Only allow supported languages
		const supportedLangs = ['en', 'hi', 'mr', 'ta', 'te'];
		const sourceLang = (detectedLang || 'en').split('-')[0];
		if (!supportedLangs.includes(sourceLang)) {
			return res.status(400).json({ error: `Language '${sourceLang}' not supported. Only English, Hindi, Marathi, Tamil, Telugu are allowed.` });
		}
		const translated = await localTranslate(transcriptText, sourceLang, targetLanguage);

		res.json({ transcript: transcriptText, translation: translated, sourceLanguage: sourceLang });
	} catch (err) {
		console.error('[audio] transcribe-and-translate failed:', err?.response?.data || err);
		res.status(500).json({ error: err.message || 'Internal Server Error' });
	}
});

module.exports = router;
