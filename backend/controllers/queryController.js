// controllers/queryController.js
const { Query, QueryResponse, User } = require('../models');
const { generateLegalAdvice, classifyQuery, extractEntities } = require('../utils/aiHelper');
const { v4: uuidv4 } = require('uuid');

class QueryController {
  // Create a new query/chat session
  async createQuery(req, res) {
    try {
      const { question, context = {}, category = 'general' } = req.body;
      const userId = req.user.id;

      if (!question || question.trim().length === 0) {
        return res.status(400).json({ error: 'Question is required' });
      }

      // Generate session ID for chat continuity
      const sessionId = context.sessionId || uuidv4();

      // Classify query automatically
      const classifiedCategory = await classifyQuery(question);
      const priority = this.determinePriority(question, classifiedCategory);

      // Create query record
      const query = await Query.create({
        userId,
        question: question.trim(),
        context: {
          ...context,
          sessionId,
          userAgent: req.headers['user-agent'],
          timestamp: new Date().toISOString()
        },
        category: classifiedCategory || category,
        priority,
        status: 'processing',
        sessionId
      });

      // Generate AI response
      try {
        const aiResponse = await generateLegalAdvice(question, {
          userId,
          sessionId,
          category: classifiedCategory || category,
          priority,
          previousContext: context.previousQueries || []
        });

        // Create response record
        const response = await QueryResponse.create({
          queryId: query.id,
          response: aiResponse.answer,
          confidence: aiResponse.confidence || 0.8,
          sources: aiResponse.sources || [],
          processingTime: aiResponse.processingTime || 0
        });

        // Update query status
        await query.update({ status: 'completed' });

        res.json({
          success: true,
          query: {
            id: query.id,
            question: query.question,
            category: query.category,
            priority: query.priority,
            sessionId: query.sessionId,
            createdAt: query.createdAt
          },
          response: {
            id: response.id,
            answer: response.response,
            confidence: response.confidence,
            sources: response.sources,
            processingTime: response.processingTime
          }
        });
      } catch (aiError) {
        await query.update({ status: 'failed' });
        throw aiError;
      }
    } catch (error) {
      console.error('Create query error:', error);
      res.status(500).json({
        error: 'Failed to process query',
        details: error.message
      });
    }
  }

  // Continue conversation in existing session
  async continueConversation(req, res) {
    try {
      const { sessionId, question } = req.body;
      const userId = req.user.id;

      if (!sessionId || !question) {
        return res.status(400).json({ error: 'Session ID and question are required' });
      }

      // Get previous queries in this session
      const previousQueries = await Query.findAll({
        where: { userId, sessionId },
        include: [{
          model: QueryResponse,
          as: 'responses'
        }],
        order: [['createdAt', 'ASC']],
        limit: 10 // Last 10 queries for context
      });

      const conversationHistory = previousQueries.map(q => ({
        question: q.question,
        answer: q.responses[0]?.response || '',
        timestamp: q.createdAt
      }));

      // Create new query
      const query = await Query.create({
        userId,
        question: question.trim(),
        context: {
          sessionId,
          conversationHistory,
          timestamp: new Date().toISOString()
        },
        category: 'general',
        priority: 'medium',
        status: 'processing',
        sessionId
      });

      // Generate contextual response
      const aiResponse = await generateLegalAdvice(question, {
        userId,
        sessionId,
        conversationHistory,
        isFollowUp: true
      });

      const response = await QueryResponse.create({
        queryId: query.id,
        response: aiResponse.answer,
        confidence: aiResponse.confidence || 0.8,
        sources: aiResponse.sources || [],
        processingTime: aiResponse.processingTime || 0
      });

      await query.update({ status: 'completed' });

      res.json({
        success: true,
        query: {
          id: query.id,
          question: query.question,
          sessionId: query.sessionId,
          createdAt: query.createdAt
        },
        response: {
          id: response.id,
          answer: response.response,
          confidence: response.confidence,
          sources: response.sources,
          processingTime: response.processingTime
        },
        conversationLength: conversationHistory.length + 1
      });
    } catch (error) {
      console.error('Continue conversation error:', error);
      res.status(500).json({
        error: 'Failed to continue conversation',
        details: error.message
      });
    }
  }

  // Get conversation history
  async getConversationHistory(req, res) {
    try {
      const { sessionId } = req.params;
      const userId = req.user.id;

      const queries = await Query.findAll({
        where: { userId, sessionId },
        include: [{
          model: QueryResponse,
          as: 'responses'
        }],
        order: [['createdAt', 'ASC']]
      });

      const conversation = queries.map(query => ({
        id: query.id,
        question: query.question,
        category: query.category,
        priority: query.priority,
        status: query.status,
        createdAt: query.createdAt,
        responses: query.responses.map(resp => ({
          id: resp.id,
          answer: resp.response,
          confidence: resp.confidence,
          sources: resp.sources,
          createdAt: resp.createdAt
        }))
      }));

      res.json({
        success: true,
        sessionId,
        conversation,
        messageCount: conversation.length
      });
    } catch (error) {
      console.error('Get conversation history error:', error);
      res.status(500).json({
        error: 'Failed to fetch conversation history',
        details: error.message
      });
    }
  }

  // Get user's query history
  async getUserQueries(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, category, status } = req.query;
      const offset = (page - 1) * limit;

      let whereClause = { userId };
      
      if (category) {
        whereClause.category = category;
      }
      
      if (status) {
        whereClause.status = status;
      }

      const { count, rows: queries } = await Query.findAndCountAll({
        where: whereClause,
        include: [{
          model: QueryResponse,
          as: 'responses',
          limit: 1,
          order: [['createdAt', 'DESC']]
        }],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        queries: queries.map(query => ({
          id: query.id,
          question: query.question.substring(0, 100) + '...',
          category: query.category,
          priority: query.priority,
          status: query.status,
          sessionId: query.sessionId,
          createdAt: query.createdAt,
          hasResponse: query.responses.length > 0,
          lastResponse: query.responses[0]?.response?.substring(0, 200) + '...' || null
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      console.error('Get user queries error:', error);
      res.status(500).json({
        error: 'Failed to fetch user queries',
        details: error.message
      });
    }
  }

  // Get quick legal advice templates
  async getQuickAdviceTemplates(req, res) {
    try {
      const templates = [
        {
          id: 1,
          category: 'criminal',
          title: 'What should I do if I\'m arrested?',
          description: 'Your rights during arrest and immediate steps to take',
          template: 'I have been arrested for [CHARGE]. What are my rights and what should I do next?'
        },
        {
          id: 2,
          category: 'civil',
          title: 'Contract dispute guidance',
          description: 'Help with contract-related legal issues',
          template: 'I have a contract dispute regarding [ISSUE]. The contract was signed on [DATE] and involves [PARTIES]. What are my options?'
        },
        {
          id: 3,
          category: 'family',
          title: 'Divorce proceedings',
          description: 'Understanding divorce process and requirements',
          template: 'I want to file for divorce in [STATE/COUNTRY]. We have been married for [DURATION] and have [CHILDREN]. What is the process?'
        },
        {
          id: 4,
          category: 'commercial',
          title: 'Business formation',
          description: 'Legal requirements for starting a business',
          template: 'I want to start a [BUSINESS_TYPE] in [LOCATION]. What legal requirements do I need to fulfill?'
        },
        {
          id: 5,
          category: 'property',
          title: 'Property purchase',
          description: 'Legal aspects of buying property',
          template: 'I am buying property worth [AMOUNT] in [LOCATION]. What legal documents and procedures should I be aware of?'
        },
        {
          id: 6,
          category: 'employment',
          title: 'Workplace rights',
          description: 'Understanding employee rights and workplace issues',
          template: 'I am facing [ISSUE] at my workplace. I work as [POSITION] at [COMPANY]. What are my rights?'
        }
      ];

      res.json({
        success: true,
        templates
      });
    } catch (error) {
      console.error('Get templates error:', error);
      res.status(500).json({
        error: 'Failed to fetch advice templates',
        details: error.message
      });
    }
  }

  // Rate query response
  async rateResponse(req, res) {
    try {
      const { queryId } = req.params;
      const { rating, feedback } = req.body;
      const userId = req.user.id;

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
      }

      const query = await Query.findOne({
        where: { id: queryId, userId }
      });

      if (!query) {
        return res.status(404).json({ error: 'Query not found' });
      }

      // Update context with rating
      const updatedContext = {
        ...query.context,
        rating,
        feedback: feedback || '',
        ratedAt: new Date().toISOString()
      };

      await query.update({ context: updatedContext });

      res.json({
        success: true,
        message: 'Response rated successfully',
        rating,
        feedback
      });
    } catch (error) {
      console.error('Rate response error:', error);
      res.status(500).json({
        error: 'Failed to rate response',
        details: error.message
      });
    }
  }

  // Get legal advice statistics
  async getAdviceStatistics(req, res) {
    try {
      const userId = req.user.id;

      const stats = await Promise.all([
        Query.count({ where: { userId } }),
        Query.count({ where: { userId, status: 'completed' } }),
        Query.count({ where: { userId, category: 'criminal' } }),
        Query.count({ where: { userId, category: 'civil' } }),
        Query.count({ where: { userId, category: 'family' } }),
        Query.count({ where: { userId, category: 'commercial' } }),
        Query.findAll({
          where: { userId },
          attributes: ['sessionId'],
          group: ['sessionId']
        })
      ]);

      const [
        totalQueries,
        completedQueries,
        criminalQueries,
        civilQueries,
        familyQueries,
        commercialQueries,
        sessions
      ] = stats;

      // Get recent activity
      const recentQueries = await Query.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
        limit: 5,
        attributes: ['id', 'question', 'category', 'status', 'createdAt']
      });

      res.json({
        success: true,
        statistics: {
          totalQueries,
          completedQueries,
          totalSessions: sessions.length,
          categoryBreakdown: {
            criminal: criminalQueries,
            civil: civilQueries,
            family: familyQueries,
            commercial: commercialQueries,
            other: totalQueries - (criminalQueries + civilQueries + familyQueries + commercialQueries)
          },
          successRate: totalQueries > 0 ? Math.round((completedQueries / totalQueries) * 100) : 0,
          recentActivity: recentQueries.map(q => ({
            id: q.id,
            question: q.question.substring(0, 50) + '...',
            category: q.category,
            status: q.status,
            createdAt: q.createdAt
          }))
        }
      });
    } catch (error) {
      console.error('Get advice statistics error:', error);
      res.status(500).json({
        error: 'Failed to fetch statistics',
        details: error.message
      });
    }
  }

  // Helper method to determine query priority
  determinePriority(question, category) {
    const urgentKeywords = ['arrest', 'urgent', 'emergency', 'deadline', 'court date', 'summons'];
    const highKeywords = ['lawsuit', 'legal notice', 'contract breach', 'termination'];
    
    const lowerQuestion = question.toLowerCase();
    
    if (urgentKeywords.some(keyword => lowerQuestion.includes(keyword))) {
      return 'urgent';
    }
    
    if (highKeywords.some(keyword => lowerQuestion.includes(keyword)) || category === 'criminal') {
      return 'high';
    }
    
    return 'medium';
  }

  // Search previous queries
  async searchQueries(req, res) {
    try {
      const { query, category, dateFrom, dateTo, page = 1, limit = 10 } = req.query;
      const userId = req.user.id;
      const offset = (page - 1) * limit;

      let whereClause = { userId };

      if (query) {
        whereClause.question = {
          [Op.iLike]: `%${query}%`
        };
      }

      if (category) {
        whereClause.category = category;
      }

      if (dateFrom || dateTo) {
        whereClause.createdAt = {};
        if (dateFrom) {
          whereClause.createdAt[Op.gte] = new Date(dateFrom);
        }
        if (dateTo) {
          whereClause.createdAt[Op.lte] = new Date(dateTo);
        }
      }

      const { count, rows: queries } = await Query.findAndCountAll({
        where: whereClause,
        include: [{
          model: QueryResponse,
          as: 'responses',
          limit: 1,
          order: [['createdAt', 'DESC']]
        }],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        queries: queries.map(q => ({
          id: q.id,
          question: q.question,
          category: q.category,
          priority: q.priority,
          status: q.status,
          sessionId: q.sessionId,
          createdAt: q.createdAt,
          response: q.responses[0]?.response || null
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        searchParams: { query, category, dateFrom, dateTo }
      });
    } catch (error) {
      console.error('Search queries error:', error);
      res.status(500).json({
        error: 'Failed to search queries',
        details: error.message
      });
    }
  }
}

module.exports = new QueryController();