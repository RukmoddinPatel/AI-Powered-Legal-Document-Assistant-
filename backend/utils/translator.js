const axios = require('axios');

class Translator {
  constructor() {
    this.supportedLanguages = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese (Simplified)',
      'hi': 'Hindi',
      'ar': 'Arabic',
      'bn': 'Bengali',
      'ur': 'Urdu',
      'ta': 'Tamil',
      'te': 'Telugu',
      'mr': 'Marathi',
      'gu': 'Gujarati',
      'kn': 'Kannada',
      'ml': 'Malayalam',
      'pa': 'Punjabi'
    };
  }

  // Main translation method
  async translateText(text, targetLanguage, sourceLanguage = 'auto') {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('No text provided for translation');
      }

      if (!this.isLanguageSupported(targetLanguage)) {
        throw new Error(`Unsupported target language: ${targetLanguage}`);
      }

      // Check if source and target languages are the same
      if (sourceLanguage === targetLanguage) {
        return {
          translatedText: text,
          sourceLanguage: sourceLanguage,
          targetLanguage: targetLanguage,
          confidence: 1.0,
          method: 'no_translation_needed'
        };
      }

      // Try Google Translate API first
      if (process.env.GOOGLE_TRANSLATE_API_KEY) {
        return await this.translateWithGoogle(text, targetLanguage, sourceLanguage);
      }

      // Fallback to free translation service
      return await this.translateWithFreeService(text, targetLanguage, sourceLanguage);

    } catch (error) {
      console.error('Translation error:', error);
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  // Google Translate API implementation
  async translateWithGoogle(text, targetLanguage, sourceLanguage = 'auto') {
    try {
      const url = 'https://translation.googleapis.com/language/translate/v2';
      
      const response = await axios.post(url, {
        q: text,
        target: targetLanguage,
        source: sourceLanguage === 'auto' ? undefined : sourceLanguage,
        format: 'text'
      }, {
        params: {
          key: process.env.GOOGLE_TRANSLATE_API_KEY
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const translation = response.data.data.translations[0];
      
      return {
        translatedText: translation.translatedText,
        sourceLanguage: translation.detectedSourceLanguage || sourceLanguage,
        targetLanguage: targetLanguage,
        confidence: 0.95, // Google Translate generally has high confidence
        method: 'google_translate',
        characterCount: text.length
      };

    } catch (error) {
      console.error('Google Translate error:', error.response?.data || error.message);
      throw new Error('Google Translation service failed');
    }
  }

  // Free translation service (MyMemory API as fallback)
  async translateWithFreeService(text, targetLanguage, sourceLanguage = 'auto') {
    try {
      // Split long text into chunks (MyMemory has character limits)
      const chunks = this.splitTextIntoChunks(text, 500);
      const translatedChunks = [];

      for (const chunk of chunks) {
        const url = 'https://api.mymemory.translated.net/get';
        
        const response = await axios.get(url, {
          params: {
            q: chunk,
            langpair: sourceLanguage === 'auto' ? `${targetLanguage}` : `${sourceLanguage}|${targetLanguage}`
          }
        });

        if (response.data.responseStatus === 200) {
          translatedChunks.push(response.data.responseData.translatedText);
        } else {
          throw new Error('Free translation service failed');
        }

        // Add delay to respect rate limits
        await this.delay(100);
      }

      return {
        translatedText: translatedChunks.join(' '),
        sourceLanguage: sourceLanguage,
        targetLanguage: targetLanguage,
        confidence: 0.75, // Lower confidence for free service
        method: 'mymemory',
        characterCount: text.length
      };

    } catch (error) {
      console.error('Free translation error:', error.message);
      throw new Error('Free translation service failed');
    }
  }

  // Split text into manageable chunks
  splitTextIntoChunks(text, maxLength) {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks = [];
    const sentences = text.split(/[.!?]+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= maxLength) {
        currentChunk += sentence + '.';
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence + '.';
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  // Detect language of text
  async detectLanguage(text) {
    try {
      if (process.env.GOOGLE_TRANSLATE_API_KEY) {
        return await this.detectLanguageWithGoogle(text);
      }

      // Fallback to basic detection
      return await this.detectLanguageBasic(text);

    } catch (error) {
      console.error('Language detection error:', error);
      return {
        language: 'en',
        confidence: 0.5,
        method: 'fallback'
      };
    }
  }

  // Google language detection
  async detectLanguageWithGoogle(text) {
    try {
      const url = 'https://translation.googleapis.com/language/translate/v2/detect';
      
      const response = await axios.post(url, {
        q: text
      }, {
        params: {
          key: process.env.GOOGLE_TRANSLATE_API_KEY
        }
      });

      const detection = response.data.data.detections[0][0];
      
      return {
        language: detection.language,
        confidence: detection.confidence,
        method: 'google_detect'
      };

    } catch (error) {
      throw new Error('Google language detection failed');
    }
  }

  // Basic language detection (simplified)
  async detectLanguageBasic(text) {
    // This is a very basic implementation
    // In production, you might want to use a more sophisticated library
    const patterns = {
      'hi': /[\u0900-\u097F]/,
      'ar': /[\u0600-\u06FF]/,
      'zh': /[\u4e00-\u9fff]/,
      'ja': /[\u3040-\u309f\u30a0-\u30ff]/,
      'ko': /[\uac00-\ud7af]/,
      'ru': /[\u0400-\u04FF]/,
      'bn': /[\u0980-\u09FF]/,
      'ta': /[\u0B80-\u0BFF]/,
      'te': /[\u0C00-\u0C7F]/,
      'gu': /[\u0A80-\u0AFF]/
    };

    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        return {
          language: lang,
          confidence: 0.8,
          method: 'pattern_matching'
        };
      }
    }

    // Default to English if no patterns match
    return {
      language: 'en',
      confidence: 0.6,
      method: 'default'
    };
  }

  // Translate legal document with context preservation
  async translateLegalDocument(text, targetLanguage, sourceLanguage = 'auto') {
    try {
      // Preserve legal formatting and structure
      const sections = this.splitLegalDocument(text);
      const translatedSections = [];

      for (const section of sections) {
        if (section.type === 'text') {
          const translated = await this.translateText(section.content, targetLanguage, sourceLanguage);
          translatedSections.push({
            type: 'text',
            content: translated.translatedText,
            original: section.content
          });
        } else {
          // Preserve non-text elements (headers, numbers, etc.)
          translatedSections.push(section);
        }

        // Small delay to respect API limits
        await this.delay(50);
      }

      return {
        translatedText: this.reconstructLegalDocument(translatedSections),
        sections: translatedSections,
        sourceLanguage: sourceLanguage,
        targetLanguage: targetLanguage,
        preservedStructure: true
      };

    } catch (error) {
      console.error('Legal document translation error:', error);
      throw new Error(`Legal document translation failed: ${error.message}`);
    }
  }

  // Split legal document into sections
  splitLegalDocument(text) {
    const sections = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (!trimmed) {
        sections.push({ type: 'empty', content: line });
      } else if (/^\d+\./.test(trimmed) || /^[A-Z]+\./.test(trimmed)) {
        sections.push({ type: 'numbered', content: line });
      } else if (trimmed.length < 100 && trimmed.toUpperCase() === trimmed) {
        sections.push({ type: 'header', content: line });
      } else {
        sections.push({ type: 'text', content: line });
      }
    }

    return sections;
  }

  // Reconstruct legal document from sections
  reconstructLegalDocument(sections) {
    return sections.map(section => section.content).join('\n');
  }

  // Check if language is supported
  isLanguageSupported(languageCode) {
    return Object.keys(this.supportedLanguages).includes(languageCode.toLowerCase());
  }

  // Get list of supported languages
  getSupportedLanguages() {
    return this.supportedLanguages;
  }

  // Get language name from code
  getLanguageName(languageCode) {
    return this.supportedLanguages[languageCode.toLowerCase()] || 'Unknown';
  }

  // Utility function for delays
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Estimate translation cost (for Google Translate)
  estimateTranslationCost(text, rate = 0.00002) {
    // Google Translate charges per character
    const characters = text.length;
    return {
      characters: characters,
      estimatedCost: characters * rate,
      currency: 'USD'
    };
  }

  // Batch translate multiple texts
  async batchTranslate(texts, targetLanguage, sourceLanguage = 'auto') {
    const results = [];
    
    for (let i = 0; i < texts.length; i++) {
      try {
        const result = await this.translateText(texts[i], targetLanguage, sourceLanguage);
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

      // Delay between requests
      if (i < texts.length - 1) {
        await this.delay(100);
      }
    }

    return results;
  }
}

module.exports = new Translator();