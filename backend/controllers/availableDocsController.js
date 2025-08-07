// controllers/availableDocsController.js
const { AvailableDocument } = require('../models');
const { Op } = require('sequelize');
const { calculateSimilarity, extractKeywords } = require('../utils/textAnalysis');

class AvailableDocsController {
  // Search available documents
  async searchDocuments(req, res) {
    try {
      const {
        query,
        category,
        court,
        year,
        judge,
        page = 1,
        limit = 10,
        sortBy = 'relevance'
      } = req.query;

      const offset = (page - 1) * limit;
      let whereClause = { isPublic: true };
      let orderClause = [];

      // Build where clause
      if (category) {
        whereClause.category = category;
      }

      if (court) {
        whereClause.court = {
          [Op.iLike]: `%${court}%`
        };
      }

      if (year) {
        whereClause.year = year;
      }

      if (judge) {
        whereClause.judge = {
          [Op.iLike]: `%${judge}%`
        };
      }

      // Handle text search
      if (query) {
        whereClause[Op.or] = [
          { title: { [Op.iLike]: `%${query}%` } },
          { summary: { [Op.iLike]: `%${query}%` } },
          { caseNumber: { [Op.iLike]: `%${query}%` } }
        ];
      }

      // Handle sorting
      switch (sortBy) {
        case 'date':
          orderClause = [['year', 'DESC'], ['createdAt', 'DESC']];
          break;
        case 'downloads':
          orderClause = [['downloadCount', 'DESC']];
          break;
        case 'relevance':
        default:
          orderClause = [['relevanceScore', 'DESC'], ['downloadCount', 'DESC']];
          break;
      }

      const { count, rows: documents } = await AvailableDocument.findAndCountAll({
        where: whereClause,
        order: orderClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        attributes: [
          'id', 'title', 'caseNumber', 'court', 'judge', 'year',
          'category', 'summary', 'citation', 'downloadCount',
          'relevanceScore', 'createdAt'
        ]
      });

      // Calculate relevance scores if query provided
      let processedDocuments = documents;
      if (query) {
        processedDocuments = await this.calculateRelevanceScores(documents, query);
        processedDocuments.sort((a, b) => b.relevanceScore - a.relevanceScore);
      }

      res.json({
        success: true,
        documents: processedDocuments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        filters: {
          query,
          category,
          court,
          year,
          judge,
          sortBy
        }
      });
    } catch (error) {
      console.error('Search documents error:', error);
      res.status(500).json({
        error: 'Failed to search documents',
        details: error.message
      });
    }
  }

  // Get similar cases
  async getSimilarCases(req, res) {
    try {
      const { documentId, caseText, limit = 5 } = req.body;

      let searchText = '';

      if (documentId) {
        // Find similar cases based on existing document
        const referenceDoc = await AvailableDocument.findByPk(documentId);
        if (!referenceDoc) {
          return res.status(404).json({ error: 'Reference document not found' });
        }
        searchText = referenceDoc.summary + ' ' + referenceDoc.title;
      } else if (caseText) {
        searchText = caseText;
      } else {
        return res.status(400).json({ error: 'Either documentId or caseText is required' });
      }

      // Get all available documents
      const allDocuments = await AvailableDocument.findAll({
        where: { 
          isPublic: true,
          ...(documentId && { id: { [Op.ne]: documentId } })
        },
        attributes: [
          'id', 'title', 'caseNumber', 'court', 'judge', 'year',
          'category', 'summary', 'citation', 'downloadCount', 'keywords'
        ]
      });

      // Calculate similarity scores
      const similarCases = await Promise.all(
        allDocuments.map(async (doc) => {
          const similarity = calculateSimilarity(
            searchText,
            doc.summary + ' ' + doc.title
          );
          
          return {
            ...doc.toJSON(),
            similarityScore: similarity
          };
        })
      );

      // Sort by similarity and take top results
      const topSimilar = similarCases
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, parseInt(limit))
        .filter(doc => doc.similarityScore > 0.1); // Minimum similarity threshold

      res.json({
        success: true,
        similarCases: topSimilar,
        searchText: searchText.substring(0, 100) + '...'
      });
    } catch (error) {
      console.error('Get similar cases error:', error);
      res.status(500).json({
        error: 'Failed to find similar cases',
        details: error.message
      });
    }
  }

  // Get document by ID with full content
  async getDocument(req, res) {
    try {
      const { id } = req.params;

      const document = await AvailableDocument.findOne({
        where: { id, isPublic: true }
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Increment download count
      await document.increment('downloadCount');

      res.json({
        success: true,
        document: {
          ...document.toJSON(),
          downloadCount: document.downloadCount + 1
        }
      });
    } catch (error) {
      console.error('Get document error:', error);
      res.status(500).json({
        error: 'Failed to fetch document',
        details: error.message
      });
    }
  }

  // Get document categories and statistics
  async getCategories(req, res) {
    try {
      const categories = await AvailableDocument.findAll({
        attributes: [
          'category',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: { isPublic: true },
        group: ['category'],
        order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']]
      });

      const courts = await AvailableDocument.findAll({
        attributes: [
          'court',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: { isPublic: true },
        group: ['court'],
        order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
        limit: 20
      });

      const years = await AvailableDocument.findAll({
        attributes: [
          'year',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: { isPublic: true },
        group: ['year'],
        order: [['year', 'DESC']],
        limit: 20
      });

      res.json({
        success: true,
        statistics: {
          categories: categories.map(cat => ({
            name: cat.category,
            count: parseInt(cat.dataValues.count)
          })),
          courts: courts.map(court => ({
            name: court.court,
            count: parseInt(court.dataValues.count)
          })),
          years: years.map(year => ({
            year: year.year,
            count: parseInt(year.dataValues.count)
          }))
        }
      });
    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({
        error: 'Failed to fetch categories',
        details: error.message
      });
    }
  }

  // Advanced search with filters
  async advancedSearch(req, res) {
    try {
      const {
        keywords = [],
        categories = [],
        courts = [],
        judges = [],
        yearRange = {},
        citationRequired = false,
        minDownloads = 0,
        page = 1,
        limit = 10
      } = req.body;

      let whereClause = { isPublic: true };
      const offset = (page - 1) * limit;

      // Keywords search
      if (keywords.length > 0) {
        const keywordConditions = keywords.map(keyword => ({
          [Op.or]: [
            { title: { [Op.iLike]: `%${keyword}%` } },
            { summary: { [Op.iLike]: `%${keyword}%` } },
            { fullText: { [Op.iLike]: `%${keyword}%` } }
          ]
        }));
        whereClause[Op.and] = keywordConditions;
      }

      // Category filter
      if (categories.length > 0) {
        whereClause.category = { [Op.in]: categories };
      }

      // Court filter
      if (courts.length > 0) {
        whereClause.court = { [Op.in]: courts };
      }

      // Judge filter
      if (judges.length > 0) {
        whereClause.judge = { [Op.in]: judges };
      }

      // Year range filter
      if (yearRange.from || yearRange.to) {
        whereClause.year = {};
        if (yearRange.from) {
          whereClause.year[Op.gte] = yearRange.from;
        }
        if (yearRange.to) {
          whereClause.year[Op.lte] = yearRange.to;
        }
      }

      // Citation filter
      if (citationRequired) {
        whereClause.citation = { [Op.ne]: null };
      }

      // Minimum downloads filter
      if (minDownloads > 0) {
        whereClause.downloadCount = { [Op.gte]: minDownloads };
      }

      const { count, rows: documents } = await AvailableDocument.findAndCountAll({
        where: whereClause,
        order: [['relevanceScore', 'DESC'], ['downloadCount', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset),
        attributes: [
          'id', 'title', 'caseNumber', 'court', 'judge', 'year',
          'category', 'summary', 'citation', 'downloadCount',
          'relevanceScore', 'keywords', 'createdAt'
        ]
      });

      res.json({
        success: true,
        documents,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        appliedFilters: {
          keywords,
          categories,
          courts,
          judges,
          yearRange,
          citationRequired,
          minDownloads
        }
      });
    } catch (error) {
      console.error('Advanced search error:', error);
      res.status(500).json({
        error: 'Advanced search failed',
        details: error.message
      });
    }
  }

  // Get trending documents
  async getTrendingDocuments(req, res) {
    try {
      const { period = '30', limit = 10 } = req.query;
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(period));

      const trendingDocs = await AvailableDocument.findAll({
        where: {
          isPublic: true,
          updatedAt: { [Op.gte]: daysAgo }
        },
        order: [['downloadCount', 'DESC'], ['relevanceScore', 'DESC']],
        limit: parseInt(limit),
        attributes: [
          'id', 'title', 'caseNumber', 'court', 'judge', 'year',
          'category', 'summary', 'citation', 'downloadCount',
          'relevanceScore', 'createdAt'
        ]
      });

      res.json({
        success: true,
        trendingDocuments: trendingDocs,
        period: `${period} days`
      });
    } catch (error) {
      console.error('Get trending documents error:', error);
      res.status(500).json({
        error: 'Failed to fetch trending documents',
        details: error.message
      });
    }
  }

  // Helper method to calculate relevance scores
  async calculateRelevanceScores(documents, query) {
    const queryKeywords = extractKeywords(query);
    
    return documents.map(doc => {
      let score = 0;
      const docText = `${doc.title} ${doc.summary}`.toLowerCase();
      
      // Keyword matching
      queryKeywords.forEach(keyword => {
        const regex = new RegExp(keyword.toLowerCase(), 'gi');
        const matches = docText.match(regex);
        if (matches) {
          score += matches.length * 10;
        }
      });

      // Title relevance bonus
      if (doc.title.toLowerCase().includes(query.toLowerCase())) {
        score += 50;
      }

      // Download count factor
      score += doc.downloadCount * 0.1;

      return {
        ...doc.toJSON(),
        relevanceScore: Math.round(score * 100) / 100
      };
    });
  }
}

module.exports = new AvailableDocsController();