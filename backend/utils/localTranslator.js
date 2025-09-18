// Local translation using @xenova/transformers
const { pipeline } = require('@xenova/transformers');
// Suppress ONNX Runtime warnings about unused initializers
const originalStderrWrite = process.stderr.write;
process.stderr.write = function (msg, ...args) {
	if (typeof msg === 'string' && msg.includes('should be removed from the model')) {
		return true; // Ignore these warnings
	}
	return originalStderrWrite.apply(process.stderr, [msg, ...args]);
};
let modelCache = {};

// Map language codes to NLLB-200 codes
const nllbLangMap = {
	en: 'eng_Latn',
	hi: 'hin_Deva',
	mr: 'mar_Deva',
	ta: 'tam_Taml',
	te: 'tel_Telu',
};

async function loadModel() {
		if (!modelCache.translator) {
			// Load NLLB-200 distilled model (best for these pairs)
			// Use lazy async loading and keep promise in cache to avoid duplicate loads
			if (!modelCache.translatorPromise) {
				modelCache.translatorPromise = pipeline('translation', 'Xenova/nllb-200-distilled-600M');
			}
			modelCache.translator = await modelCache.translatorPromise;
		}
		return modelCache.translator;
}

/**
 * Translate text using local NLLB-200 model
 * @param {string} text
 * @param {string} sourceLang
 * @param {string} targetLang
 * @returns {Promise<string>}
 */
async function localTranslate(text, sourceLang, targetLang) {
	const translator = await loadModel();
	const src = nllbLangMap[sourceLang] || 'eng_Latn';
	const tgt = nllbLangMap[targetLang] || 'eng_Latn';
	const result = await translator(text, { src_lang: src, tgt_lang: tgt });
	return result[0]?.translation_text || text;
}

module.exports = { localTranslate };
