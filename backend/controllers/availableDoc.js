const AvailableDocument = require('../models/AvailableDocument');
const { Op } = require('sequelize');

// Get all available documents with search and filter
const getAvailableDocuments = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      court, 
      year, 
      keyword,
      sortBy = 'relevanceScore',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    const where = { isPublic: true };

    // Apply filters
    if (category) where.category = category;
    if (court) where.court = { [Op.like]: `%${court}%` };
    if (year) where.year = year;
    if (keyword) {
      where[Op.or] = [
        { title: { [Op.like]: `%${keyword}%` } },
        { summary: { [Op.like]: `%${keyword}%` } },
        { keywords: { [Op.like]: `%${keyword}%` } }
      ];
    }

    const documents = await AvailableDocument.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder]],
      attributes: { exclude: ['fullText'] } // Exclude full text for listing
    });

    res.json({
      success: true,
      documents: documents.rows,
      pagination: {
        total: documents.count,
        page: parseInt(page),
        pages: Math.ceil(documents.count / limit)
      },
      filters: {
        category,
        court,
        year,
        keyword
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single available document
const getAvailableDocument = async (req, res) => {
  try {
    const document = await AvailableDocument.findByPk(req.params.id);

    if (!document || !document.isPublic) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    // Increment download count
    await document.increment('downloadCount');

    res.json({ success: true, document });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Search available documents by relevance
const searchAvailableDocuments = async (req, res) => {
  try {
    const { query, category, limit = 20 } = req.query;

    if (!query) {
      return res.status(400).json({ success: false, message: 'Search query required' });
    }

    const searchKeywords = query.toLowerCase().split(' ').filter(word => word.length > 2);
    
    const where = {
      isPublic: true,
      [Op.and]: [
        {
          [Op.or]: [
            { title: { [Op.like]: `%${query}%` } },
            { summary: { [Op.like]: `%${query}%` } },
            { fullText: { [Op.like]: `%${query}%` } },
            { keywords: { [Op.like]: `%${query}%` } }
          ]
        }
      ]
    };

    if (category) {
      where.category = category;
    }

    const documents = await AvailableDocument.findAll({
      where,
      limit: parseInt(limit),
      order: [
        ['relevanceScore', 'DESC'],
        ['downloadCount', 'DESC'],
        ['year', 'DESC']
      ],
      attributes: { exclude: ['fullText'] }
    });

    // Calculate relevance scores based on keyword matches
    const scoredDocuments = documents.map(doc => {
      let score = doc.relevanceScore;
      
      // Boost score based on keyword matches
      searchKeywords.forEach(keyword => {
        if (doc.title.toLowerCase().includes(keyword)) score += 0.3;
        if (doc.summary.toLowerCase().includes(keyword)) score += 0.2;
        if (doc.keywords && JSON.stringify(doc.keywords).toLowerCase().includes(keyword)) score += 0.1;
      });
      
      return {
        ...doc.toJSON(),
        calculatedRelevance: Math.min(score, 1.0)
      };
    });

    // Sort by calculated relevance
    scoredDocuments.sort((a, b) => b.calculatedRelevance - a.calculatedRelevance);

    res.json({
      success: true,
      query,
      totalResults: scoredDocuments.length,
      documents: scoredDocuments
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get similar cases based on current case context
const getSimilarCases = async (req, res) => {
  try {
    const { caseContext, category, limit = 10 } = req.body;

    if (!caseContext) {
      return res.status(400).json({ success: false, message: 'Case context required' });
    }

    const keywords = caseContext.toLowerCase().split(' ').filter(word => word.length > 3);
    
    const where = {
      isPublic: true,
      [Op.or]: keywords.map(keyword => ({
        [Op.or]: [
          { summary: { [Op.like]: `%${keyword}%` } },
          { fullText: { [Op.like]: `%${keyword}%` } },
          { keywords: { [Op.like]: `%${keyword}%` } }
        ]
      }))
    };

    if (category) {
      where.category = category;
    }

    const similarCases = await AvailableDocument.findAll({
      where,
      limit: parseInt(limit),
      order: [
        ['relevanceScore', 'DESC'],
        ['year', 'DESC']
      ],
      attributes: { exclude: ['fullText'] }
    });

    res.json({
      success: true,
      caseContext,
      similarCases,
      totalFound: similarCases.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get document categories and statistics
const getDocumentCategories = async (req, res) => {
  try {
    const categories = await AvailableDocument.findAll({
      where: { isPublic: true },
      attributes: [
        'category',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('AVG', sequelize.col('relevanceScore')), 'avgRelevance']
      ],
      group: ['category'],
      order: [['count', 'DESC']],
      raw: true
    });

    const courts = await AvailableDocument.findAll({
      where: { isPublic: true },
      attributes: [
        'court',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['court'],
      order: [['count', 'DESC']],
      limit: 20,
      raw: true
    });

    const years = await AvailableDocument.findAll({
      where: { isPublic: true },
      attributes: [
        'year',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['year'],
      order: [['year', 'DESC']],
      limit: 10,
      raw: true
    });

    res.json({
      success: true,
      statistics: {
        categories,
        topCourts: courts,
        recentYears: years
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Download available document (increment counter)
const downloadAvailableDocument = async (req, res) => {
  try {
    const document = await AvailableDocument.findByPk(req.params.id);

    if (!document || !document.isPublic) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    // Increment download count
    await document.increment('downloadCount');

    // If there's a file path, serve the file
    if (document.filePath && require('fs').existsSync(document.filePath)) {
      res.download(document.filePath, `${document.caseNumber}.pdf`);
    } else {
      // Return full text as downloadable content
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${document.caseNumber}.txt"`);
      res.send(document.fullText);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get trending/popular documents
const getTrendingDocuments = async (req, res) => {
  try {
    const { limit = 10, period = '30' } = req.query;
    
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - parseInt(period));

    const trending = await AvailableDocument.findAll({
      where: {
        isPublic: true,
        updatedAt: { [Op.gte]: dateThreshold }
      },
      order: [
        ['downloadCount', 'DESC'],
        ['relevanceScore', 'DESC']
      ],
      limit: parseInt(limit),
      attributes: { exclude: ['fullText'] }
    });

    res.json({
      success: true,
      period: `${period} days`,
      trendingDocuments: trending
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAvailableDocuments,
  getAvailableDocument,
  searchAvailableDocuments,
  getSimilarCases,
  getDocumentCategories,
  downloadAvailableDocument,
  getTrendingDocuments
};