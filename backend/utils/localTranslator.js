const path = require('path');
const { Worker } = require('worker_threads');

const CHUNK_MAX_CHARS = 420;
const CHUNK_TRANSLATION_TIMEOUT_MS = 25000;

let worker = null;
let requestCounter = 0;
let pendingRequests = new Map();

function createWorker() {
	const workerPath = path.join(__dirname, 'localTranslateWorker.js');
	const instance = new Worker(workerPath);

	instance.on('message', (message) => {
		const { id, translatedText, error } = message || {};
		const pending = pendingRequests.get(id);
		if (!pending) return;

		pendingRequests.delete(id);
		if (error) {
			pending.reject(new Error(error));
			return;
		}

		pending.resolve(translatedText);
	});

	instance.on('error', () => {
		for (const [id, pending] of pendingRequests.entries()) {
			pending.reject(new Error('Translation worker crashed'));
			pendingRequests.delete(id);
		}
	});

	instance.on('exit', (code) => {
		worker = null;
		if (code !== 0) {
			for (const [id, pending] of pendingRequests.entries()) {
				pending.reject(new Error('Translation worker exited unexpectedly'));
				pendingRequests.delete(id);
			}
		}
	});

	return instance;
}

function getWorker() {
	if (!worker) {
		worker = createWorker();
	}
	return worker;
}

function splitTextIntoChunks(text, maxChars = CHUNK_MAX_CHARS) {
	const input = String(text || '').trim();
	if (!input) return [];
	if (input.length <= maxChars) return [input];

	const sentenceLike = input.match(/[^.!?\n]+[.!?\n]?/g) || [input];
	const chunks = [];
	let current = '';

	for (const pieceRaw of sentenceLike) {
		const piece = pieceRaw.trim();
		if (!piece) continue;

		if (piece.length > maxChars) {
			if (current) {
				chunks.push(current.trim());
				current = '';
			}

			for (let i = 0; i < piece.length; i += maxChars) {
				chunks.push(piece.slice(i, i + maxChars).trim());
			}
			continue;
		}

		const candidate = current ? `${current} ${piece}` : piece;
		if (candidate.length > maxChars) {
			chunks.push(current.trim());
			current = piece;
		} else {
			current = candidate;
		}
	}

	if (current.trim()) {
		chunks.push(current.trim());
	}

	return chunks;
}

async function translateChunkWithTimeout(chunk, sourceLang, targetLang) {
	const workerInstance = getWorker();
	const id = ++requestCounter;

	const translatePromise = new Promise((resolve, reject) => {
		pendingRequests.set(id, { resolve, reject });
		workerInstance.postMessage({ id, text: chunk, sourceLang, targetLang });
	});

	const timeoutPromise = new Promise((resolve) => {
		setTimeout(async () => {
			pendingRequests.delete(id);
			resolve(chunk);

			// Reset worker if it is hanging, so next requests can recover.
			if (worker) {
				try {
					await worker.terminate();
				} catch {
					// Ignore terminate errors
				}
				worker = null;
			}
		}, CHUNK_TRANSLATION_TIMEOUT_MS);
	});

	return Promise.race([
		translatePromise.catch(() => chunk),
		timeoutPromise,
	]);
}

/**
 * Translate text using local NLLB-200 model
 * @param {string} text
 * @param {string} sourceLang
 * @param {string} targetLang
 * @returns {Promise<string>}
 */
async function localTranslate(text, sourceLang, targetLang) {
	const chunks = splitTextIntoChunks(text);
	if (chunks.length <= 1) {
		const result = await translateChunkWithTimeout(text, sourceLang, targetLang);
		return result || text;
	}

	const translatedChunks = [];
	for (const chunk of chunks) {
		const translated = await translateChunkWithTimeout(chunk, sourceLang, targetLang);
		translatedChunks.push(String(translated || chunk));
	}

	return translatedChunks.join(' ').replace(/\s+/g, ' ').trim() || text;
}

module.exports = { localTranslate };
