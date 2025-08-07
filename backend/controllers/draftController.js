// controllers/draftController.js
const { DraftTemplate } = require('../models');
const { Op } = require('sequelize');
const { generateCustomDocument, validateTemplateVariables } = require('../utils/documentGenerator');

class DraftController {
  // Get all available templates
  async getTemplates(req, res) {
    try {
      const { 
        category, 
        subcategory, 
        difficulty, 
        search, 
        page = 1, 
        limit = 12,
        sortBy = 'usageCount' 
      } = req.query;

      const offset = (page - 1) * limit;
      let whereClause = { isActive: true };
      let orderClause = [];

      // Build where clause
      if (category) {
        whereClause.category = category;
      }

      if (subcategory) {
        whereClause.subcategory = subcategory;
      }

      if (difficulty) {
        whereClause.difficulty = difficulty;
      }

      if (search) {
        whereClause[Op.or] = [
          { title: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } }
        ];
      }

      // Handle sorting
      switch (sortBy) {
        case 'title':
          orderClause = [['title', 'ASC']];
          break;
        case 'rating':
          orderClause = [['rating', 'DESC']];
          break;
        case 'recent':
          orderClause = [['createdAt', 'DESC']];
          break;
        case 'usageCount':
        default:
          orderClause = [['usageCount', 'DESC']];
          break;
      }

      const { count, rows: templates } = await DraftTemplate.findAndCountAll({
        where: whereClause,
        order: orderClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        attributes: [
          'id', 'title', 'category', 'subcategory', 'description',
          'difficulty', 'usageCount', 'rating', 'tags', 'createdAt'
        ]
      });

      res.json({
        success: true,
        templates,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        filters: {
          category,
          subcategory,
          difficulty,
          search,
          sortBy
        }
      });
    } catch (error) {
      console.error('Get templates error:', error);
      res.status(500).json({
        error: 'Failed to fetch templates',
        details: error.message
      });
    }
  }

  // Get template by ID with full content
  async getTemplate(req, res) {
    try {
      const { id } = req.params;

      const template = await DraftTemplate.findOne({
        where: { id, isActive: true }
      });

      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      res.json({
        success: true,
        template
      });
    } catch (error) {
      console.error('Get template error:', error);
      res.status(500).json({
        error: 'Failed to fetch template',
        details: error.message
      });
    }
  }

  // Generate document from template
  async generateDocument(req, res) {
    try {
      const { templateId } = req.params;
      const { variables, customizations = {} } = req.body;

      const template = await DraftTemplate.findOne({
        where: { id: templateId, isActive: true }
      });

      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      // Validate required variables
      const validationResult = validateTemplateVariables(template.variables, variables);
      if (!validationResult.isValid) {
        return res.status(400).json({
          error: 'Missing required variables',
          missingVariables: validationResult.missingVariables
        });
      }

      // Generate the document
      const generatedDocument = await generateCustomDocument(
        template.templateContent,
        variables,
        customizations
      );

      // Increment usage count
      await template.increment('usageCount');

      res.json({
        success: true,
        document: {
          title: template.title,
          category: template.category,
          content: generatedDocument.content,
          generatedAt: new Date().toISOString(),
          variables: variables,
          customizations: customizations
        },
        template: {
          id: template.id,
          title: template.title,
          usageCount: template.usageCount + 1
        }
      });
    } catch (error) {
      console.error('Generate document error:', error);
      res.status(500).json({
        error: 'Failed to generate document',
        details: error.message
      });
    }
  }

  // Get template categories and statistics
  async getCategories(req, res) {
    try {
      const categories = await DraftTemplate.findAll({
        attributes: [
          'category',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('AVG', sequelize.col('rating')), 'avgRating']
        ],
        where: { isActive: true },
        group: ['category'],
        order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']]
      });

      const subcategories = await DraftTemplate.findAll({
        attributes: [
          'category',
          'subcategory',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: { 
          isActive: true,
          subcategory: { [Op.ne]: null }
        },
        group: ['category', 'subcategory'],
        order: [['category', 'ASC'], [sequelize.fn('COUNT', sequelize.col('id')), 'DESC']]
      });

      const difficulties = await DraftTemplate.findAll({
        attributes: [
          'difficulty',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: { isActive: true },
        group: ['difficulty']
      });

      res.json({
        success: true,
        statistics: {
          categories: categories.map(cat => ({
            name: cat.category,
            count: parseInt(cat.dataValues.count),
            avgRating: parseFloat(cat.dataValues.avgRating || 0).toFixed(1)
          })),
          subcategories: subcategories.reduce((acc, sub) => {
            if (!acc[sub.category]) {
              acc[sub.category] = [];
            }
            acc[sub.category].push({
              name: sub.subcategory,
              count: parseInt(sub.dataValues.count)
            });
            return acc;
          }, {}),
          difficulties: difficulties.map(diff => ({
            level: diff.difficulty,
            count: parseInt(diff.dataValues.count)
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

  // Get popular templates
  async getPopularTemplates(req, res) {
    try {
      const { limit = 6, category } = req.query;

      let whereClause = { isActive: true };
      if (category) {
        whereClause.category = category;
      }

      const popularTemplates = await DraftTemplate.findAll({
        where: whereClause,
        order: [
          ['usageCount', 'DESC'],
          ['rating', 'DESC']
        ],
        limit: parseInt(limit),
        attributes: [
          'id', 'title', 'category', 'description',
          'difficulty', 'usageCount', 'rating', 'tags'
        ]
      });

      res.json({
        success: true,
        popularTemplates
      });
    } catch (error) {
      console.error('Get popular templates error:', error);
      res.status(500).json({
        error: 'Failed to fetch popular templates',
        details: error.message
      });
    }
  }

  // Search templates with advanced filters
  async searchTemplates(req, res) {
    try {
      const {
        query,
        categories = [],
        difficulties = [],
        tags = [],
        minRating = 0,
        maxUsage,
        page = 1,
        limit = 12
      } = req.body;

      const offset = (page - 1) * limit;
      let whereClause = { isActive: true };

      // Text search
      if (query) {
        whereClause[Op.or] = [
          { title: { [Op.iLike]: `%${query}%` } },
          { description: { [Op.iLike]: `%${query}%` } },
          { templateContent: { [Op.iLike]: `%${query}%` } }
        ];
      }

      // Category filter
      if (categories.length > 0) {
        whereClause.category = { [Op.in]: categories };
      }

      // Difficulty filter
      if (difficulties.length > 0) {
        whereClause.difficulty = { [Op.in]: difficulties };
      }

      // Rating filter
      if (minRating > 0) {
        whereClause.rating = { [Op.gte]: minRating };
      }

      // Usage filter
      if (maxUsage) {
        whereClause.usageCount = { [Op.lte]: maxUsage };
      }

      // Tags filter (JSON array contains any of the specified tags)
      if (tags.length > 0) {
        whereClause.tags = {
          [Op.overlap]: tags
        };
      }

      const { count, rows: templates } = await DraftTemplate.findAndCountAll({
        where: whereClause,
        order: [['usageCount', 'DESC'], ['rating', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset),
        attributes: [
          'id', 'title', 'category', 'subcategory', 'description',
          'difficulty', 'usageCount', 'rating', 'tags', 'createdAt'
        ]
      });

      res.json({
        success: true,
        templates,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        searchParams: {
          query,
          categories,
          difficulties,
          tags,
          minRating,
          maxUsage
        }
      });
    } catch (error) {
      console.error('Search templates error:', error);
      res.status(500).json({
        error: 'Failed to search templates',
        details: error.message
      });
    }
  }

  // Rate template
  async rateTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const { rating, feedback } = req.body;

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
      }

      const template = await DraftTemplate.findOne({
        where: { id: templateId, isActive: true }
      });

      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      // Simple rating calculation (in production, you'd want a more sophisticated system)
      const newRating = ((template.rating * template.usageCount) + rating) / (template.usageCount + 1);
      
      await template.update({
        rating: Math.round(newRating * 10) / 10 // Round to 1 decimal place
      });

      res.json({
        success: true,
        message: 'Template rated successfully',
        newRating: template.rating
      });
    } catch (error) {
      console.error('Rate template error:', error);
      res.status(500).json({
        error: 'Failed to rate template',
        details: error.message
      });
    }
  }

  // Get recommended templates based on usage history
  async getRecommendedTemplates(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 5 } = req.query;

      // This is a simplified recommendation system
      // In production, you'd implement more sophisticated algorithms
      
      // Get user's most used categories from their document history
      const userCategories = await DraftTemplate.findAll({
        attributes: [
          'category',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        // You'd join with user's usage history here
        group: ['category'],
        order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
        limit: 3
      });

      const preferredCategories = userCategories.map(cat => cat.category);

      // Get highly rated templates from preferred categories
      let whereClause = { 
        isActive: true,
        rating: { [Op.gte]: 4.0 }
      };

      if (preferredCategories.length > 0) {
        whereClause.category = { [Op.in]: preferredCategories };
      }

      const recommendedTemplates = await DraftTemplate.findAll({
        where: whereClause,
        order: [
          ['rating', 'DESC'],
          ['usageCount', 'DESC']
        ],
        limit: parseInt(limit),
        attributes: [
          'id', 'title', 'category', 'description',
          'difficulty', 'usageCount', 'rating', 'tags'
        ]
      });

      res.json({
        success: true,
        recommendedTemplates,
        basedOn: preferredCategories.length > 0 ? 'user_preferences' : 'popular_templates'
      });
    } catch (error) {
      console.error('Get recommended templates error:', error);
      res.status(500).json({
        error: 'Failed to fetch recommended templates',
        details: error.message
      });
    }
  }

  // Create custom template (for premium users or admins)
  async createTemplate(req, res) {
    try {
      const {
        title,
        category,
        subcategory,
        description,
        templateContent,
        variables = [],
        tags = [],
        difficulty = 'beginner'
      } = req.body;

      const userId = req.user.id;

      // Validate required fields
      if (!title || !category || !templateContent) {
        return res.status(400).json({
          error: 'Title, category, and template content are required'
        });
      }

      // Create new template
      const template = await DraftTemplate.create({
        title,
        category,
        subcategory,
        description,
        templateContent,
        variables,
        tags,
        difficulty,
        createdBy: userId,
        usageCount: 0,
        rating: 0.0,
        isActive: true
      });

      res.json({
        success: true,
        template: {
          id: template.id,
          title: template.title,
          category: template.category,
          subcategory: template.subcategory,
          description: template.description,
          difficulty: template.difficulty,
          createdAt: template.createdAt
        },
        message: 'Template created successfully'
      });
    } catch (error) {
      console.error('Create template error:', error);
      res.status(500).json({
        error: 'Failed to create template',
        details: error.message
      });
    }
  }

  // Preview template with sample data
  async previewTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const { sampleVariables = {} } = req.body;

      const template = await DraftTemplate.findOne({
        where: { id: templateId, isActive: true }
      });

      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      // Generate preview with sample data
      const previewDocument = await generateCustomDocument(
        template.templateContent,
        sampleVariables,
        { preview: true }
      );

      res.json({
        success: true,
        preview: {
          title: template.title,
          content: previewDocument.content,
          variables: template.variables,
          sampleVariables
        }
      });
    } catch (error) {
      console.error('Preview template error:', error);
      res.status(500).json({
        error: 'Failed to generate template preview',
        details: error.message
      });
    }
  }
}

module.exports = new DraftController();