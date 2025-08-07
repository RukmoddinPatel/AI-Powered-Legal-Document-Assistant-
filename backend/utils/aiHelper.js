// utils/aiHelper.js
const OpenAI = require('openai');
const natural = require('natural');
const compromise = require('compromise');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class AIHelper {
  // Summarize legal document
  async summarizeDocument(text, summaryType = 'brief') {
    try {
      const maxTokens = summaryType === 'brief' ? 200 : 500;
      
      const prompt = `Please provide a ${summaryType} summary of the following legal document. Focus on key legal points, parties involved, obligations, and important dates:

${text.substring(0, 8000)}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a legal expert specializing in document analysis and summarization. Provide clear, accurate summaries that highlight the most important legal aspects.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature: 0.3
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('Document summarization error:', error);
      throw new Error('Failed to summarize document');
    }
  }

  // Simplify legal language
  async simplifyLegalText(text, complexityLevel = 'simple') {
    try {
      let instruction = '';
      
      switch (complexityLevel) {
        case 'simple':
          instruction = 'Rewrite this legal text in simple, everyday language that a high school student can understand. Avoid legal jargon and explain complex concepts clearly.';
          break;
        case 'intermediate':
          instruction = 'Rewrite this legal text in clearer language while maintaining some legal terminology. Make it accessible to someone with basic legal knowledge.';
          break;
        case 'detailed':
          instruction = 'Rewrite this legal text to be clearer and more organized while preserving all legal nuances and important details.';
          break;
        default:
          instruction = 'Simplify this legal text to make it more understandable.';
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a legal expert who specializes in making complex legal language accessible to non-lawyers while maintaining accuracy.'
          },
          {
            role: 'user',
            content: `${instruction}\n\nLegal text:\n${text.substring(0, 6000)}`
          }
        ],
        max_tokens: 1000,
        temperature: 0.4
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('Text simplification error:', error);
      throw new Error('Failed to simplify legal text');
    }
  }

  // Answer questions about documents
  async answerDocumentQuestion(documentText, question) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a legal expert who analyzes documents and answers questions about them. Provide accurate, specific answers based only on the document content. If the answer is not in the document, clearly state that.'
          },
          {
            role: 'user',
            content: `Document content:\n${documentText.substring(0, 8000)}\n\nQuestion: ${question}`
          }
        ],
        max_tokens: 500,
        temperature: 0.2
      });

      const answer = response.choices[0].message.content.trim();
      
      return {
        response: answer,
        confidence: this.calculateConfidence(answer),
        sources: this.extractRelevantSections(documentText, question)
      };
    } catch (error) {
      console.error('Document question answering error:', error);
      throw new Error('Failed to answer question about document');
    }
  }

  // Generate legal advice
  async generateLegalAdvice(question, context = {}) {
    try {
      let systemPrompt = `You are an AI legal advisor. Provide helpful legal information and guidance while making it clear that this is general information and not specific legal advice. Always recommend consulting with a qualified attorney for specific legal matters.

Important disclaimers to include:
- This is general legal information, not specific legal advice
- Laws vary by jurisdiction
- Recommend consulting with a qualified attorney
- For urgent legal matters, seek immediate professional help`;

      let userPrompt = question;

      if (context.conversationHistory && context.conversationHistory.length > 0) {
        const recentHistory = context.conversationHistory.slice(-3);
        userPrompt = `Previous conversation context:\n${recentHistory.map(h => `Q: ${h.question}\nA: ${h.answer}`).join('\n\n')}\n\nCurrent question: ${question}`;
      }

      if (context.category) {
        systemPrompt += `\n\nThis question is in the category: ${context.category}`;
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        max_tokens: 800,
        temperature: 0.4
      });

      const answer = response.choices[0].message.content.trim();

      return {
        answer,
        confidence: this.calculateConfidence(answer),
        sources: [],
        processingTime: Date.now() - (context.startTime || Date.now())
      };
    } catch (error) {
      console.error('Legal advice generation error:', error);
      throw new Error('Failed to generate legal advice');
    }
  }

  // Classify query category
  async classifyQuery(question) {
    try {
      const categories = [
        'criminal', 'civil', 'family', 'commercial', 'constitutional',
        'labor', 'tax', 'immigration', 'real_estate', 'intellectual_property',
        'contract', 'tort', 'general'
      ];

      // Simple keyword-based classification first
      const lowerQuestion = question.toLowerCase();
      
      if (lowerQuestion.includes('divorce') || lowerQuestion.includes('custody') || lowerQuestion.includes('marriage')) {
        return 'family';
      }
      if (lowerQuestion.includes('business') || lowerQuestion.includes('company') || lowerQuestion.includes('contract')) {
        return 'commercial';
      }
      if (lowerQuestion.includes('arrest') || lowerQuestion.includes('crime') || lowerQuestion.includes('police')) {
        return 'criminal';
      }
      if (lowerQuestion.includes('property') || lowerQuestion.includes('real estate') || lowerQuestion.includes('rent')) {
        return 'real_estate';
      }
      if (lowerQuestion.includes('work') || lowerQuestion.includes('employment') || lowerQuestion.includes('job')) {
        return 'labor';
      }

      // Fallback to AI classification for complex cases
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `Classify the following legal question into one of these categories: ${categories.join(', ')}. Respond with only the category name.`
          },
          {
            role: 'user',
            content: question
          }
        ],
        max_tokens: 10,
        temperature: 0.1
      });

      const classification = response.choices[0].message.content.trim().toLowerCase();
      return categories.includes(classification) ? classification : 'general';
    } catch (error) {
      console.error('Query classification error:', error);
      return 'general';
    }
  }

  // Extract entities from legal text
  extractEntities(text) {
    try {
      const doc = compromise(text);
      
      // Extract different types of entities
      const entities = {
        people: doc.people().out('array'),
        places: doc.places().out('array'),
        organizations: doc.organizations().out('array'),
        dates: doc.dates().out('array'),
        money: doc.money().out('array'),
        emails: text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g) || [],
        phoneNumbers: text.match(/(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g) || [],
        caseNumbers: text.match(/\b(?:case|matter|file)\s*(?:no\.?|number|#)\s*:?\s*([a-z0-9\-\/]+)/gi) || []
      };

      return entities;
    } catch (error) {
      console.error('Entity extraction error:', error);
      return {};
    }
  }

  // Calculate confidence score based on response characteristics
  calculateConfidence(response) {
    let confidence = 0.8; // Base confidence

    // Lower confidence if response contains uncertainty phrases
    const uncertaintyPhrases = [
      'i\'m not sure', 'it depends', 'may vary', 'consult', 'might', 'possibly',
      'generally', 'typically', 'usually', 'often', 'sometimes'
    ];

    const lowerResponse = response.toLowerCase();
    const uncertaintyCount = uncertaintyPhrases.filter(phrase => 
      lowerResponse.includes(phrase)
    ).length;

    confidence -= (uncertaintyCount * 0.1);

    // Adjust based on response length (very short or very long responses might be less confident)
    if (response.length < 50) {
      confidence -= 0.2;
    } else if (response.length > 1000) {
      confidence -= 0.1;
    }

    // Boost confidence if response includes specific legal terms or citations
    const legalTerms = [
      'statute', 'regulation', 'precedent', 'case law', 'jurisdiction',
      'constitutional', 'federal', 'state law', 'court', 'judge'
    ];

    const legalTermCount = legalTerms.filter(term => 
      lowerResponse.includes(term)
    ).length;

    confidence += (legalTermCount * 0.05);

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  // Extract relevant sections from document for citations
  extractRelevantSections(documentText, question) {
    try {
      const questionWords = question.toLowerCase().split(' ').filter(word => word.length > 3);
      const sentences = documentText.split(/[.!?]+/);
      
      const relevantSections = sentences
        .map((sentence, index) => ({
          text: sentence.trim(),
          index,
          relevance: this.calculateSentenceRelevance(sentence, questionWords)
        }))
        .filter(section => section.relevance > 0.2)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 3)
        .map(section => section.text);

      return relevantSections;
    } catch (error) {
      console.error('Section extraction error:', error);
      return [];
    }
  }

  // Calculate how relevant a sentence is to the question
  calculateSentenceRelevance(sentence, questionWords) {
    const sentenceWords = sentence.toLowerCase().split(' ');
    const matches = questionWords.filter(word => 
      sentenceWords.some(sentenceWord => sentenceWord.includes(word))
    );
    
    return matches.length / questionWords.length;
  }

  // Generate document templates with AI
  async generateDocumentTemplate(templateType, requirements = {}) {
    try {
      const prompt = `Generate a professional legal document template for: ${templateType}

Requirements: ${JSON.stringify(requirements)}

Please include:
1. Proper legal formatting
2. Placeholder variables in [VARIABLE_NAME] format
3. Standard legal clauses appropriate for this document type
4. Professional language and structure

Template:`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a legal document expert who creates professional, legally sound document templates. Use proper legal formatting and include all necessary standard clauses.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.3
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('Template generation error:', error);
      throw new Error('Failed to generate document template');
    }
  }
}

module.exports = new AIHelper();