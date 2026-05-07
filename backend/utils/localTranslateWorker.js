const { parentPort } = require('worker_threads');
const { pipeline } = require('@xenova/transformers');

// Suppress noisy ONNX warnings in worker output.
const originalStderrWrite = process.stderr.write;
process.stderr.write = function (msg, ...args) {
  if (typeof msg === 'string' && msg.includes('should be removed from the model')) {
    return true;
  }
  return originalStderrWrite.apply(process.stderr, [msg, ...args]);
};

const nllbLangMap = {
  en: 'eng_Latn',
  hi: 'hin_Deva',
  mr: 'mar_Deva',
  ta: 'tam_Taml',
  te: 'tel_Telu',
};

let translatorPromise = null;

async function getTranslator() {
  if (!translatorPromise) {
    translatorPromise = pipeline('translation', 'Xenova/nllb-200-distilled-600M');
  }
  return translatorPromise;
}

if (!parentPort) {
  module.exports = {};
  return;
}

parentPort.on('message', async (payload) => {
  const { id, text, sourceLang, targetLang } = payload || {};

  if (!id) return;

  try {
    const translator = await getTranslator();
    const src = nllbLangMap[sourceLang] || 'eng_Latn';
    const tgt = nllbLangMap[targetLang] || 'eng_Latn';
    const result = await translator(String(text || ''), { src_lang: src, tgt_lang: tgt });
    const translatedText = result?.[0]?.translation_text || String(text || '');

    parentPort.postMessage({ id, translatedText });
  } catch (error) {
    parentPort.postMessage({ id, error: error?.message || 'Translation worker failed' });
  }
});
