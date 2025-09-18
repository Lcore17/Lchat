const sentiment = require('sentiment');

// Initialize sentiment analyzer
const sentimentAnalyzer = new sentiment();

// Simple sarcasm detection using heuristics
// In a production environment, you would use a proper ML model
async function detectSarcasm(text) {
  try {
    // Method 1: Check for sarcasm indicators
    const sarcasmIndicators = [
      /yeah\s+right/i,
      /oh\s+great/i,
      /just\s+perfect/i,
      /exactly\s+what\s+i\s+wanted/i,
      /thanks\s+a\s+lot/i,
      /how\s+wonderful/i,
      /absolutely\s+fantastic/i,
      /couldn't\s+be\s+better/i,
      /just\s+brilliant/i,
      /what\s+a\s+surprise/i
    ];

    const hasIndicators = sarcasmIndicators.some(pattern => pattern.test(text));

    // Method 2: Sentiment analysis with punctuation
    const sentimentResult = sentimentAnalyzer.analyze(text);
    const hasPositiveWords = sentimentResult.positive.length > 0;
    const hasNegativeContext = /\.\.\.|🙄|😒|😑|not!|NOT!/i.test(text);
    const hasExclamation = /!/.test(text);

    // Method 3: Check for contradictory patterns
    const positivePatterns = /(great|awesome|fantastic|wonderful|perfect|brilliant|amazing|excellent)/i;
    const negativeContext = /(but|however|yeah|sure|totally|absolutely).*(\.\.\.|not|NOT)/i;
    
    const hasPositiveWords2 = positivePatterns.test(text);
    const hasNegativeContext2 = negativeContext.test(text);

    // Scoring system
    let sarcasmScore = 0;

    if (hasIndicators) sarcasmScore += 0.4;
    if (hasPositiveWords && hasNegativeContext) sarcasmScore += 0.3;
    if (hasPositiveWords2 && hasNegativeContext2) sarcasmScore += 0.3;
    if (hasExclamation && hasNegativeContext) sarcasmScore += 0.2;
    if (sentimentResult.score > 2 && hasNegativeContext) sarcasmScore += 0.2;

    // Additional patterns
    if (/sure,|yeah,|totally,|absolutely,/i.test(text) && hasPositiveWords) {
      sarcasmScore += 0.2;
    }

    const isSarcastic = sarcasmScore >= 0.3;

    return {
      isSarcastic,
      confidence: Math.min(sarcasmScore, 1.0),
      indicators: {
        hasIndicators,
        hasPositiveWords: hasPositiveWords || hasPositiveWords2,
        hasNegativeContext: hasNegativeContext || hasNegativeContext2,
        sentimentScore: sentimentResult.score
      }
    };

  } catch (error) {
    console.error('Sarcasm detection error:', error);
    return {
      isSarcastic: false,
      confidence: 0,
      indicators: {}
    };
  }
}

// For future ML model integration
async function detectSarcasmML(text) {
  try {
    // Placeholder for machine learning model integration
    // You can integrate with Hugging Face, TensorFlow.js, or other ML libraries
    
    /*
    Example with Hugging Face Inference API:
    
    const response = await fetch('https://api-inference.huggingface.co/models/cardiffnlp/twitter-roberta-base-irony', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: text })
    });
    
    const result = await response.json();
    // Process result...
    */

    // For now, fallback to rule-based detection
    return await detectSarcasm(text);

  } catch (error) {
    console.error('ML Sarcasm detection error:', error);
    return await detectSarcasm(text);
  }
}

// Test function
async function testSarcasmDetection() {
  const testCases = [
    "I love working on weekends!", // Not sarcastic
    "Yeah, I just love working on weekends...", // Sarcastic
    "Oh great, another meeting", // Sarcastic
    "This is absolutely fantastic!", // Could be either
    "Sure, that sounds like a great idea 🙄", // Sarcastic
    "Thanks a lot for the help", // Could be either
    "Yeah right, like that's going to work", // Sarcastic
    "The weather is beautiful today", // Not sarcastic
    "Couldn't be better... NOT!", // Sarcastic
    "What a wonderful surprise this is" // Could be either
  ];

  console.log('Testing sarcasm detection:\n');
  
  for (const testCase of testCases) {
    const result = await detectSarcasm(testCase);
    console.log(`Text: "${testCase}"`);
    console.log(`Sarcastic: ${result.isSarcastic} (confidence: ${result.confidence.toFixed(2)})`);
    console.log('---');
  }
}

module.exports = {
  detectSarcasm,
  detectSarcasmML,
  testSarcasmDetection
};