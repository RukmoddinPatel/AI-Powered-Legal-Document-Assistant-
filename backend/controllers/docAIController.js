const Document = require('../models/Document');
const OCR = require('../utils/ocrHelper');
const AIHelper = require('../utils/aiHelper');
const Translator = require('../utils/translator');
const { simplifyLegalText } = require('../utils/simplifyLegalText');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// File upload configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = 'uploads/documents';
    await fs.mkdir(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, TXT, and image files allowed.'));
    }
  }
}).single('document');

// Upload document
const uploadDocument = async (req, res) => {
  try {
    const { title, documentType } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Extract text using OCR
    const fileExt = path.extname(file.originalname).substring(1);
    const ocrResult = await OCR.extractText(file.path, fileExt);

    // Create document record
    const document = await Document.create({
      userId: req.user.id,
      title: title || file.originalname,
      originalFileName: file.originalname,
      fileName: file.filename,
      filePath: file.path,
      fileType: fileExt,
      fileSize: file.size,
      mimeType: file.mimetype,
      documentType: documentType || 'other',
      originalText: ocrResult.text,
      confidence: ocrResult.confidence,
      status: 'processed'
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded and processed successfully',
      document: {
        id: document.id,
        title: document.title,
        status: document.status,
        confidence: document.confidence,
        wordCount: ocrResult.wordCount
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all documents for user
const getDocuments = async (req, res) => {
  try {
    const { page = 1, limit = 10, type, status } = req.query;
    const offset = (page - 1) * limit;

    const where = { userId: req.user.id };
    if (type) where.documentType = type;
    if (status) where.status = status;

    const documents = await Document.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['originalText', 'simplifiedText'] }
    });

    res.json({
      success: true,
      documents: documents.rows,
      pagination: {
        total: documents.count,
        page: parseInt(page),
        pages: Math.ceil(documents.count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single document
const getDocument = async (req, res) => {
  try {
    const document = await Document.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    res.json({ success: true, document });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Simplify document language
const simplifyDocument = async (req, res) => {
  try {
    const { complexityLevel = 'simple' } = req.body;
    
    const document = await Document.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    if (!document.originalText) {
      return res.status(400).json({ success: false, message: 'No text available to simplify' });
    }

    // Simplify using AI helper
    const simplified = await AIHelper.simplifyLegalText(document.originalText, complexityLevel);

    // Update document with simplified text
    await document.update({ simplifiedText: simplified });

    res.json({
      success: true,
      message: 'Document simplified successfully',
      simplifiedText: simplified,
      readabilityImprovement: 'Text has been simplified for better understanding'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Summarize document
const summarizeDocument = async (req, res) => {
  try {
    const { summaryType = 'brief' } = req.body;
    
    const document = await Document.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const summary = await AIHelper.summarizeDocument(document.originalText, summaryType);

    res.json({
      success: true,
      summary,
      summaryType,
      originalLength: document.originalText?.length || 0
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Translate document
const translateDocument = async (req, res) => {
  try {
    const { targetLanguage, sourceLanguage = 'auto' } = req.body;
    
    const document = await Document.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const translation = await Translator.translateLegalDocument(
      document.originalText, 
      targetLanguage, 
      sourceLanguage
    );

    res.json({
      success: true,
      translation: translation.translatedText,
      sourceLanguage: translation.sourceLanguage,
      targetLanguage: translation.targetLanguage,
      preservedStructure: translation.preservedStructure
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Ask question about document
const askDocumentQuestion = async (req, res) => {
  try {
    const { question } = req.body;
    
    const document = await Document.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const answer = await AIHelper.answerDocumentQuestion(document.originalText, question);

    res.json({
      success: true,
      question,
      answer: answer.response,
      confidence: answer.confidence,
      sources: answer.sources
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Search documents
const searchDocuments = async (req, res) => {
  try {
    const { query, type, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    if (!query) {
      return res.status(400).json({ success: false, message: 'Search query required' });
    }

    const where = { 
      userId: req.user.id,
      [Op.or]: [
        { title: { [Op.like]: `%${query}%` } },
        { originalText: { [Op.like]: `%${query}%` } }
      ]
    };

    if (type) where.documentType = type;

    const documents = await Document.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['originalText', 'simplifiedText'] }
    });

    res.json({
      success: true,
      query,
      documents: documents.rows,
      pagination: {
        total: documents.count,
        page: parseInt(page),
        pages: Math.ceil(documents.count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Download document
const downloadDocument = async (req, res) => {
  try {
    const document = await Document.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    // Update download count
    await document.increment('downloadCount');

    res.download(document.filePath, document.originalFileName);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete document
const deleteDocument = async (req, res) => {
  try {
    const document = await Document.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    // Delete file from filesystem
    try {
      await fs.unlink(document.filePath);
    } catch (fileError) {
      console.warn('Could not delete file:', fileError.message);
    }

    await document.destroy();

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get document statistics
const getDocumentStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const stats = await Document.findAll({
      where: { userId },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalDocuments'],
        [sequelize.fn('SUM', sequelize.col('fileSize')), 'totalSize'],
        [sequelize.fn('SUM', sequelize.col('downloadCount')), 'totalDownloads']
      ],
      raw: true
    });

    const typeStats = await Document.findAll({
      where: { userId },
      attributes: [
        'documentType',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['documentType'],
      raw: true
    });

    res.json({
      success: true,
      stats: {
        totalDocuments: stats[0].totalDocuments || 0,
        totalSizeMB: Math.round((stats[0].totalSize || 0) / (1024 * 1024)),
        totalDownloads: stats[0].totalDownloads || 0,
        typeBreakdown: typeStats
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  upload,
  uploadDocument,
  getDocuments,
  getDocument,
  simplifyDocument,
  summarizeDocument,
  translateDocument,
  askDocumentQuestion,
  searchDocuments,
  downloadDocument,
  deleteDocument,
  getDocumentStats
};