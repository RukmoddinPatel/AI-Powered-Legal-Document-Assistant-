// controllers/docAIController.js
const { Document, DocumentTranslation } = require('../models');
const translateText = require('../utils/translator');
const { summarizeDocument, simplifyLegalText, answerDocumentQuestion } = require('../utils/aiHelper');
const { extractTextFromFile } = require('../utils/documentProcessor');

class DocAIController {
  // Translate document
  async translateDocument(req, res) {
    try {
      const { documentId, targetLanguage } = req.body;
      const userId = req.user.id;

      const document = await Document.findOne({
        where: { id: documentId, userId }
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Check if translation already exists
      const existingTranslation = await DocumentTranslation.findOne({
        where: {
          documentId,
          targetLanguage,
          status: 'completed'
        }
      });

      if (existingTranslation) {
        return res.json({
          success: true,
          translation: existingTranslation
        });
      }

      // Get text to translate
      let textToTranslate = document.extractedText;
      if (!textToTranslate) {
        // Extract text from file if not already extracted
        textToTranslate = await extractTextFromFile(document.filePath, document.fileType);
        await document.update({ extractedText: textToTranslate });
      }

      // Create translation record
      const translation = await DocumentTranslation.create({
        documentId,
        originalLanguage: 'auto', // Auto-detect
        targetLanguage,
        originalText: textToTranslate,
        translatedText: '',
        status: 'pending'
      });

      try {
        // Perform translation
        const translatedText = await translateText(textToTranslate, targetLanguage);
        
        await translation.update({
          translatedText,
          status: 'completed',
          confidence: 0.95 // Default confidence for successful translation
        });

        res.json({
          success: true,
          translation: {
            id: translation.id,
            originalText: textToTranslate,
            translatedText,
            targetLanguage,
            status: 'completed'
          }
        });
      } catch (error) {
        await translation.update({ status: 'failed' });
        throw error;
      }
    } catch (error) {
      console.error('Translation error:', error);
      res.status(500).json({ 
        error: 'Translation failed', 
        details: error.message 
      });
    }
  }

  // Summarize document
  async summarizeDocument(req, res) {
    try {
      const { documentId, summaryType = 'brief' } = req.body;
      const userId = req.user.id;

      const document = await Document.findOne({
        where: { id: documentId, userId }
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Return existing summary if available
      if (document.summary && summaryType === 'brief') {
        return res.json({
          success: true,
          summary: document.summary,
          cached: true
        });
      }

      let textToSummarize = document.extractedText;
      if (!textToSummarize) {
        textToSummarize = await extractTextFromFile(document.filePath, document.fileType);
        await document.update({ extractedText: textToSummarize });
      }

      const summary = await summarizeDocument(textToSummarize, summaryType);
      
      // Cache brief summary
      if (summaryType === 'brief') {
        await document.update({ summary });
      }

      res.json({
        success: true,
        summary,
        summaryType,
        cached: false
      });
    } catch (error) {
      console.error('Summarization error:', error);
      res.status(500).json({ 
        error: 'Summarization failed', 
        details: error.message 
      });
    }
  }

  // Simplify legal language
  async simplifyLanguage(req, res) {
    try {
      const { documentId, complexityLevel = 'simple' } = req.body;
      const userId = req.user.id;

      const document = await Document.findOne({
        where: { id: documentId, userId }
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Return existing simplified text if available
      if (document.simplifiedText && complexityLevel === 'simple') {
        return res.json({
          success: true,
          simplifiedText: document.simplifiedText,
          cached: true
        });
      }

      let textToSimplify = document.extractedText;
      if (!textToSimplify) {
        textToSimplify = await extractTextFromFile(document.filePath, document.fileType);
        await document.update({ extractedText: textToSimplify });
      }

      const simplifiedText = await simplifyLegalText(textToSimplify, complexityLevel);
      
      // Cache simple version
      if (complexityLevel === 'simple') {
        await document.update({ simplifiedText });
      }

      res.json({
        success: true,
        originalText: textToSimplify,
        simplifiedText,
        complexityLevel,
        cached: false
      });
    } catch (error) {
      console.error('Simplification error:', error);
      res.status(500).json({ 
        error: 'Text simplification failed', 
        details: error.message 
      });
    }
  }

  // Answer questions about document
  async answerQuestion(req, res) {
    try {
      const { documentId, question } = req.body;
      const userId = req.user.id;

      if (!question || question.trim().length === 0) {
        return res.status(400).json({ error: 'Question is required' });
      }

      const document = await Document.findOne({
        where: { id: documentId, userId }
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      let documentText = document.extractedText;
      if (!documentText) {
        documentText = await extractTextFromFile(document.filePath, document.fileType);
        await document.update({ extractedText: documentText });
      }

      const answer = await answerDocumentQuestion(documentText, question);

      res.json({
        success: true,
        question,
        answer: answer.response,
        confidence: answer.confidence,
        sources: answer.sources || []
      });
    } catch (error) {
      console.error('Question answering error:', error);
      res.status(500).json({ 
        error: 'Failed to answer question', 
        details: error.message 
      });
    }
  }

  // Get document analysis
  async analyzeDocument(req, res) {
    try {
      const { documentId } = req.params;
      const userId = req.user.id;

      const document = await Document.findOne({
        where: { id: documentId, userId },
        include: [{
          model: DocumentTranslation,
          as: 'translations'
        }]
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      let documentText = document.extractedText;
      if (!documentText) {
        documentText = await extractTextFromFile(document.filePath, document.fileType);
        await document.update({ extractedText: documentText });
      }

      // Perform comprehensive analysis
      const analysis = {
        wordCount: documentText.split(/\s+/).length,
        readabilityScore: calculateReadabilityScore(documentText),
        keyPhrases: extractKeyPhrases(documentText),
        documentType: classifyDocument(documentText),
        complexity: assessComplexity(documentText),
        summary: document.summary || await summarizeDocument(documentText, 'brief'),
        translations: document.translations || []
      };

      res.json({
        success: true,
        document: {
          id: document.id,
          title: document.title,
          category: document.category,
          createdAt: document.createdAt
        },
        analysis
      });
    } catch (error) {
      console.error('Document analysis error:', error);
      res.status(500).json({ 
        error: 'Document analysis failed', 
        details: error.message 
      });
    }
  }

  // Get translation history
  async getTranslations(req, res) {
    try {
      const { documentId } = req.params;
      const userId = req.user.id;

      const document = await Document.findOne({
        where: { id: documentId, userId }
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const translations = await DocumentTranslation.findAll({
        where: { documentId },
        order: [['createdAt', 'DESC']]
      });

      res.json({
        success: true,
        translations
      });
    } catch (error) {
      console.error('Get translations error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch translations', 
        details: error.message 
      });
    }
  }
}

// Helper functions
function calculateReadabilityScore(text) {
  // Simple Flesch Reading Ease implementation
  const sentences = text.split(/[.!?]+/).length - 1;
  const words = text.split(/\s+/).length;
  const syllables = countSyllables(text);
  
  if (sentences === 0 || words === 0) return 0;
  
  const score = 206.835 - (1.015 * (words / sentences)) - (84.6 * (syllables / words));
  return Math.max(0, Math.min(100, Math.round(score)));
}

function countSyllables(text) {
  const words = text.toLowerCase().split(/\s+/);
  let syllableCount = 0;
  
  words.forEach(word => {
    const vowels = word.match(/[aeiouy]+/g);
    syllableCount += vowels ? vowels.length : 1;
  });
  
  return syllableCount;
}

function extractKeyPhrases(text) {
  // Simple keyword extraction
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3);
  
  const frequency = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });
  
  return Object.entries(frequency)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([word]) => word);
}

function classifyDocument(text) {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('agreement') || lowerText.includes('contract')) {
    return 'contract';
  } else if (lowerText.includes('petition') || lowerText.includes('court')) {
    return 'lawsuit';
  } else if (lowerText.includes('order') || lowerText.includes('judgment')) {
    return 'court_order';
  } else if (lowerText.includes('notice')) {
    return 'legal_notice';
  }
  
  return 'other';
}

function assessComplexity(text) {
  const avgSentenceLength = text.split(/[.!?]+/).reduce((sum, sentence) => {
    return sum + sentence.split(/\s+/).length;
  }, 0) / text.split(/[.!?]+/).length;
  
  const complexWords = text.split(/\s+/).filter(word => word.length > 6).length;
  const totalWords = text.split(/\s+/).length;
  const complexityRatio = complexWords / totalWords;
  
  if (avgSentenceLength > 20 || complexityRatio > 0.3) {
    return 'high';
  } else if (avgSentenceLength > 15 || complexityRatio > 0.2) {
    return 'medium';
  }
  
  return 'low';
}

module.exports = new DocAIController();