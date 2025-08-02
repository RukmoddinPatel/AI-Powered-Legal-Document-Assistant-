const axios = require('axios');

// Legal jargon to simple terms mapping
const legalTermsMap = {
  'heretofore': 'before this',
  'hereinafter': 'from now on',
  'whereas': 'since',
  'hereby': 'by this document',
  'therein': 'in that',
  'thereof': 'of that',
  'hereunder': 'under this agreement',
  'notwithstanding': 'despite',
  'aforementioned': 'mentioned before',
  'subsequent': 'later',
  'prior': 'before',
  'pursuant to': 'according to',
  'in lieu of': 'instead of',
  'forthwith': 'immediately',
  'ipso facto': 'by the fact itself',
  'inter alia': 'among other things',
  'vis-à-vis': 'in relation to',
  'force majeure': 'unforeseeable circumstances',
  'caveat emptor': 'buyer beware',
  'quid pro quo': 'something for something',
  'sine qua non': 'essential requirement',
  'ad hoc': 'for this specific purpose',
  'bona fide': 'genuine',
  'pro rata': 'proportionally',
  'status quo': 'current situation',
  'cease and desist': 'stop',
  'null and void': 'cancelled',
  'in perpetuity': 'forever',
  'indemnify': 'protect from loss'
};

// Complex sentence patterns and their simpler alternatives
const sentencePatterns = [
  {
    pattern: /shall be deemed to be/gi,
    replacement: 'is considered'
  },
  {
    pattern: /in the event that/gi,
    replacement: 'if'
  },
  {
    pattern: /for the purpose of/gi,
    replacement: 'to'
  },
  {
    pattern: /with respect to/gi,
    replacement: 'about'
  },
  {
    pattern: /in accordance with/gi,
    replacement: 'following'
  },
  {
    pattern: /in connection with/gi,
    replacement: 'related to'
  },
  {
    pattern: /subject to the provisions of/gi,
    replacement: 'following the rules in'
  },
  {
    pattern: /without prejudice to/gi,
    replacement: 'without affecting'
  }
];

// Basic legal text simplification
const basicSimplification = (text) => {
  let simplifiedText = text;

  // Replace legal terms
  Object.entries(legalTermsMap).forEach(([legalTerm, simpleTerm]) => {
    const regex = new RegExp(`\\b${legalTerm}\\b`, 'gi');
    simplifiedText = simplifiedText.replace(regex, simpleTerm);
  });

  // Replace complex sentence patterns
  sentencePatterns.forEach(({ pattern, replacement }) => {
    simplifiedText = simplifiedText.replace(pattern, replacement);
  });

  // Break down long sentences
  simplifiedText = breakDownLongSentences(simplifiedText);

  // Improve readability
  simplifiedText = improveReadability(simplifiedText);

  return simplifiedText;
};

// Break down long sentences
const breakDownLongSentences = (text) => {
  const sentences = text.split(/[.!?]+/);
  const simplifiedSentences = [];

  sentences.forEach(sentence => {
    const trimmedSentence = sentence.trim();
    if (trimmedSentence.length === 0) return;

    // If sentence is very long (>150 characters), try to break it down
    if (trimmedSentence.length > 150) {
      // Look for conjunctions and break at those points
      const conjunctions = [', and ', ', but ', ', or ', ', however ', ', therefore ', ', furthermore '];
      let broken = false;

      for (const conjunction of conjunctions) {
        if (trimmedSentence.includes(conjunction)) {
          const parts = trimmedSentence.split(conjunction);
          parts.forEach((part, index) => {
            if (index === 0) {
              simplifiedSentences.push(part.trim() + '.');
            } else {
              simplifiedSentences.push(part.trim() + '.');
            }
          });
          broken = true;
          break;
        }
      }

      if (!broken) {
        simplifiedSentences.push(trimmedSentence + '.');
      }
    } else {
      simplifiedSentences.push(trimmedSentence + '.');
    }
  });

  return simplifiedSentences.join(' ');
};

// Improve overall readability
const improveReadability = (text) => {
  let improvedText = text;

  // Convert passive voice to active voice (basic patterns)
  const passivePatterns = [
    {
      pattern: /shall be (\w+ed) by/gi,
      replacement: 'will be $1 by'
    },
    {
      pattern: /is required to be/gi,
      replacement: 'must be'
    },
    {
      pattern: /are required to/gi,
      replacement: 'must'
    }
  ];

  passivePatterns.forEach(({ pattern, replacement }) => {
    improvedText = improvedText.replace(pattern, replacement);
  });

  // Simplify modal verbs
  improvedText = improvedText.replace(/shall/gi, 'will');
  improvedText = improvedText.replace(/may not/gi, 'cannot');

  // Clean up extra spaces and formatting
  improvedText = improvedText.replace(/\s+/g, ' ').trim();

  return improvedText;
};

// AI-powered simplification using OpenAI or similar service
const aiSimplification = async (text) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a legal document simplification expert. Your task is to rewrite complex legal text in simple, everyday language that anyone can understand. Follow these guidelines:

1. Use simple, common words instead of legal jargon
2. Break down long, complex sentences into shorter ones
3. Explain legal concepts in plain English
4. Maintain the original meaning and intent
5. Use active voice instead of passive voice when possible
6. Replace Latin phrases with English equivalents
7. Make the text more conversational and accessible

The output should be clear, concise, and easy to understand while preserving all important legal information.`
          },
          {
            role: 'user',
            content: `Please simplify this legal text: "${text}"`
          }
        ],
        max_tokens: 2000,
        temperature: 0.3
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('AI Simplification Error:', error);
    throw new Error(`AI simplification failed: ${error.message}`);
  }
};

// Hugging Face alternative for AI simplification
const huggingFaceSimplification = async (text) => {
  try {
    const apiKey = process.env.HUGGING_FACE_API_KEY;
    if (!apiKey) {
      throw new Error('Hugging Face API key not configured');
    }

    // Using a text simplification model
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/facebook/bart-large-cnn',
      {
        inputs: `Simplify this legal text into plain English: ${text}`,
        parameters: {
          max_length: 1000,
          min_length: 50,
          do_sample: false
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data[0].summary_text;
  } catch (error) {
    console.error('Hugging Face Simplification Error:', error);
    throw new Error(`Hugging Face simplification failed: ${error.message}`);
  }
};

// Main simplification function
const simplifyLegalText = async (text, options = {}) => {
  try {
    const {
      method = 'hybrid', // 'basic', 'ai', 'hybrid'
      aiProvider = 'openai', // 'openai', 'huggingface'
      preserveStructure = true
    } = options;

    if (!text || text.trim().length === 0) {
      throw new Error('No text provided for simplification');
    }

    let simplifiedText = text;

    switch (method) {
      case 'basic':
        simplifiedText = basicSimplification(text);
        break;

      case 'ai':
        if (aiProvider === 'huggingface') {
          simplifiedText = await huggingFaceSimplification(text);
        } else {
          simplifiedText = await aiSimplification(text);
        }
        break;

      case 'hybrid':
      default:
        // First apply basic simplification
        const basicResult = basicSimplification(text);
        
        // Then try AI simplification if available
        try {
          if (process.env.OPENAI_API_KEY) {
            simplifiedText = await aiSimplification(basicResult);
          } else if (process.env.HUGGING_FACE_API_KEY) {
            simplifiedText = await huggingFaceSimplification(basicResult);
          } else {
            simplifiedText = basicResult;
          }
        } catch (aiError) {
          console.warn('AI simplification failed, using basic result:', aiError.message);
          simplifiedText = basicResult;
        }
        break;
    }

    // Post-processing
    if (preserveStructure) {
      simplifiedText = preserveDocumentStructure(simplifiedText, text);
    }

    return {
      originalText: text,
      simplifiedText: simplifiedText.trim(),
      method: method,
      wordCountReduction: calculateWordCountReduction(text, simplifiedText),
      readabilityScore: calculateReadabilityScore(simplifiedText)
    };
  } catch (error) {
    console.error('Legal Text Simplification Error:', error);
    throw new Error(`Text simplification failed: ${error.message}`);
  }
};

// Preserve document structure (headings, numbering, etc.)
const preserveDocumentStructure = (simplifiedText, originalText) => {
  // Extract structural elements from original text
  const structuralPatterns = [
    /^\d+\.\s+/gm, // Numbered lists
    /^[A-Z]+\.\s+/gm, // Letter lists
    /^Article\s+\d+/gmi, // Articles
    /^Section\s+\d+/gmi, // Sections
    /^Chapter\s+\d+/gmi, // Chapters
    /^\([a-z]\)/gm, // Lettered subsections
    /^\(\d+\)/gm // Numbered subsections
  ];

  // This is a simplified approach - in a real implementation,
  // you'd want more sophisticated structure preservation
  return simplifiedText;
};

// Calculate word count reduction percentage
const calculateWordCountReduction = (originalText, simplifiedText) => {
  const originalWords = originalText.split(/\s+/).length;
  const simplifiedWords = simplifiedText.split(/\s+/).length;
  const reduction = ((originalWords - simplifiedWords) / originalWords) * 100;
  return Math.round(reduction);
};

// Calculate basic readability score (Flesch Reading Ease approximation)
const calculateReadabilityScore = (text) => {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const syllables = words.reduce((count, word) => {
    return count + countSyllables(word);
  }, 0);

  if (sentences.length === 0 || words.length === 0) return 0;

  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;

  // Flesch Reading Ease formula
  const score = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);
  
  return Math.max(0, Math.min(100, Math.round(score)));
};

// Count syllables in a word (approximation)
const countSyllables = (word) => {
  word = word.toLowerCase();
  if (word.length <= 3) return 1;
  
  let syllables = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return syllables ? syllables.length : 1;
};

// Get simplification suggestions
const getSimplificationSuggestions = (text) => {
  const suggestions = [];
  
  // Check for complex legal terms
  Object.entries(legalTermsMap).forEach(([legalTerm, simpleTerm]) => {
    const regex = new RegExp(`\\b${legalTerm}\\b`, 'gi');
    if (regex.test(text)) {
      suggestions.push({
        type: 'terminology',
        original: legalTerm,
        suggestion: simpleTerm,
        description: `Replace legal jargon "${legalTerm}" with simpler term "${simpleTerm}"`
      });
    }
  });

  // Check for long sentences
  const sentences = text.split(/[.!?]+/);
  sentences.forEach((sentence, index) => {
    if (sentence.trim().length > 150) {
      suggestions.push({
        type: 'sentence_length',
        sentence: sentence.trim(),
        position: index + 1,
        description: 'This sentence is very long and could be broken down into shorter ones'
      });
    }
  });

  // Check for passive voice
  const passiveVoicePattern = /\b(is|are|was|were|being|been)\s+\w+ed\b/gi;
  const passiveMatches = text.match(passiveVoicePattern);
  if (passiveMatches && passiveMatches.length > 0) {
    suggestions.push({
      type: 'passive_voice',
      count: passiveMatches.length,
      description: 'Consider converting passive voice to active voice for better clarity'
    });
  }

  return suggestions;
};

// Batch simplification for multiple documents
const batchSimplifyTexts = async (texts, options = {}) => {
  const results = [];
  
  for (let i = 0; i < texts.length; i++) {
    try {
      const result = await simplifyLegalText(texts[i], options);
      results.push({
        index: i,
        success: true,
        ...result
      });
    } catch (error) {
      results.push({
        index: i,
        success: false,
        error: error.message,
        originalText: texts[i]
      });
    }
  }
  
  return results;
};

module.exports = {
  simplifyLegalText,
  basicSimplification,
  aiSimplification,
  huggingFaceSimplification,
  getSimplificationSuggestions,
  batchSimplifyTexts,
  calculateReadabilityScore,
  legalTermsMap
};