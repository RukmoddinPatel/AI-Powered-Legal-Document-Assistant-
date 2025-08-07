// controllers/queryController.js
const Query = require('../models/Query');
const QueryResponse = require('../models/QueryResponse');
const AIHelper = require('../utils/aiHelper');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

// Create new query (AI Chatbot)
const askQuestion = async (req, res) => {
  try {
    const { question, context, category, priority = 'medium' } = req.body;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Question is required'
      });
    }

    // Create session ID if not provided
    const sessionId = req.body.sessionId || uuidv4();

    // Create query record
    const query = await Query.create({
      userId: req.user.id,
      question: question.trim(),
      context: context || {},
      category: category || 'general',
      priority,
      status: 'processing',
      sessionId
    });

    try {
      // Classify query if category not provided
      const queryCategory = category || await AIHelper.classifyQuery(question);
      
      // Get conversation history for context
      const conversationHistory = await getConversationHistory(req.user.id, sessionId, 5);
      
      // Generate AI response
      const aiResult = await AIHelper.generateLegalAdvice(question, {
        category: queryCategory,
        conversationHistory,
        startTime: Date.now(),
        userRole: req.user.role
      });

      // Create response record
      const response = await QueryResponse.create({
        queryId: query.id,
        response: aiResult.answer,
        confidence: aiResult.confidence,
        sources: aiResult.sources || [],
        processingTime: aiResult.processingTime
      });

      // Update query status
      await query.update({
        status: 'completed',
        category: queryCategory
      });

      res.json({
        success: true,
        query: {
          id: query.id,
          question: query.question,
          category: queryCategory,
          sessionId: query.sessionId,
          status: 'completed'
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
      // Update query status to failed
      await query.update({ status: 'failed' });
      
      throw aiError;
    }

  } catch (error) {
    console.error('Query processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process query',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get user's query history
const getQueryHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, sessionId, status } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = { userId: req.user.id };
    
    if (category) whereClause.category = category;
    if (sessionId) whereClause.sessionId = sessionId;
    if (status) whereClause.status = status;

    const { rows: queries, count } = await Query.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: QueryResponse,
          as: 'responses',
          required: false
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      queries: queries.map(query => ({
        id: query.id,
        question: query.question,
        category: query.category,
        priority: query.priority,
        status: query.status,
        sessionId: query.sessionId,
        response: query.responses[0] ? {
          answer: query.responses[0].response,
          confidence: query.responses[0].confidence,
          processingTime: query.responses[0].processingTime
        } : null,
        createdAt: query.createdAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Query history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get query history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get specific query with responses
const getQuery = async (req, res) => {
  try {
    const { id } = req.params;

    const query = await Query.findOne({
      where: { id, userId: req.user.id },
      include: [
        {
          model: QueryResponse,
          as: 'responses',
          order: [['createdAt', 'DESC']]
        }
      ]
    });

    if (!query) {
      return res.status(404).json({
        success: false,
        message: 'Query not found'
      });
    }

    res.json({
      success: true,
      query: {
        id: query.id,
        question: query.question,
        category: query.category,
        priority: query.priority,
        status: query.status,
        sessionId: query.sessionId,
        context: query.context,
        responses: query.responses.map(response => ({
          id: response.id,
          answer: response.response,
          confidence: response.confidence,
          sources: response.sources,
          processingTime: response.processingTime,
          createdAt: response.createdAt
        })),
        createdAt: query.createdAt,
        updatedAt: query.updatedAt
      }
    });

  } catch (error) {
    console.error('Get query error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get query',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get conversation by session
const getConversation = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50 } = req.query;

    const queries = await Query.findAll({
      where: { 
        userId: req.user.id, 
        sessionId,
        status: 'completed'
      },
      include: [
        {
          model: QueryResponse,
          as: 'responses',
          required: true
        }
      ],
      order: [['createdAt', 'ASC']],
      limit: parseInt(limit)
    });

    const conversation = queries.map(query => ({
      id: query.id,
      question: query.question,
      answer: query.responses[0]?.response || '',
      confidence: query.responses[0]?.confidence || 0,
      timestamp: query.createdAt
    }));

    res.json({
      success: true,
      sessionId,
      conversation,
      messageCount: conversation.length
    });

  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get conversation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Rate/feedback on response
const rateResponse = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, feedback } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    // Find the query response
    const response = await QueryResponse.findOne({
      include: [
        {
          model: Query,
          as: 'query',
          where: { userId: req.user.id }
        }
      ],
      where: { id }
    });

    if (!response) {
      return res.status(404).json({
        success: false,
        message: 'Response not found'
      });
    }

    // Update response with rating and feedback
    await response.update({
      rating,
      feedback: feedback || null
    });

    res.json({
      success: true,
      message: 'Rating submitted successfully',
      response: {
        id: response.id,
        rating,
        feedback
      }
    });

  } catch (error) {
    console.error('Rate response error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit rating',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get query statistics
const getQueryStats = async (req, res) => {
  try {
    const stats = await Query.findAll({
      where: { userId: req.user.id },
      attributes: [
        'category',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['category']
    });

    const statusStats = await Query.findAll({
      where: { userId: req.user.id },
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status']
    });

    const totalQueries = await Query.count({
      where: { userId: req.user.id }
    });

    res.json({
      success: true,
      stats: {
        totalQueries,
        byCategory: stats.reduce((acc, stat) => {
          acc[stat.category] = parseInt(stat.dataValues.count);
          return acc;
        }, {}),
        byStatus: statusStats.reduce((acc, stat) => {
          acc[stat.status] = parseInt(stat.dataValues.count);
          return acc;
        }, {})
      }
    });

  } catch (error) {
    console.error('Query stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get query statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Helper function to get conversation history
const getConversationHistory = async (userId, sessionId, limit = 5) => {
  try {
    const recentQueries = await Query.findAll({
      where: { 
        userId, 
        sessionId,
        status: 'completed'
      },
      include: [
        {
          model: QueryResponse,
          as: 'responses',
          required: true
        }
      ],
      order: [['createdAt', 'DESC']],
      limit
    });

    return recentQueries.map(query => ({
      question: query.question,
      answer: query.responses[0]?.response || ''
    }));
  } catch (error) {
    console.error('Error getting conversation history:', error);
    return [];
  }
};

module.exports = {
  askQuestion,
  getQueryHistory,
  getQuery,
  getConversation,
  rateResponse,
  getQueryStats
};