const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const Document = require('../models/Document');
const OCR = require('../utils/ocrHelper');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Rate limiting and quota management
const rateLimiter = {
  requests: new Map(),
  maxRequestsPerMinute: 3, // Adjust based on your OpenAI plan
  
  canMakeRequest: (userId) => {
    const now = Date.now();
    const userRequests = rateLimiter.requests.get(userId) || [];
    
    // Remove requests older than 1 minute
    const recentRequests = userRequests.filter(time => now - time < 60000);
    rateLimiter.requests.set(userId, recentRequests);
    
    return recentRequests.length < rateLimiter.maxRequestsPerMinute;
  },
  
  recordRequest: (userId) => {
    const userRequests = rateLimiter.requests.get(userId) || [];
    userRequests.push(Date.now());
    rateLimiter.requests.set(userId, userRequests);
  }
};

// File upload config
const upload = multer({
  dest: 'uploads/documents/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'text/plain'];
    cb(null, allowed.includes(file.mimetype));
  }
});

const uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    
    const { title, tags } = req.body;
    
    // Extract text using OCR
    const extractedText = await OCR.extractText(req.file.path, req.file.mimetype.split('/')[1]);
    
    const doc = await Document.create({
      userId: req.user.id,
      title: title || req.file.originalname,
      originalFileName: req.file.originalname,
      fileName: req.file.filename,
      filePath: req.file.path,
      fileType: path.extname(req.file.originalname).slice(1),
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      originalText: extractedText.text,
      confidence: extractedText.confidence,
      tags: tags ? JSON.parse(tags) : []
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      documentId: doc.id,
      extractedLength: extractedText.text?.length || 0
    });
  } catch (error) {
    if (req.file) fs.removeSync(req.file.path);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
};

const getDocuments = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const docs = await Document.findAndCountAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      attributes: { exclude: ['originalText', 'simplifiedText'] }
    });

    res.json({
      success: true,
      documents: docs.rows,
      total: docs.count,
      page: parseInt(page),
      totalPages: Math.ceil(docs.count / limit)
    });
  } catch (error) {
    res.status(500).json({ error: 'Fetch failed' });
  }
};

const getDocument = async (req, res) => {
  try {
    const doc = await Document.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    
    res.json({ success: true, document: doc });
  } catch (error) {
    res.status(500).json({ error: 'Fetch failed' });
  }
};

const searchDocuments = async (req, res) => {
  try {
    const { q: query } = req.query;
    if (!query) return res.status(400).json({ error: 'Query required' });

    const docs = await Document.findAll({
      where: {
        userId: req.user.id,
        [Document.sequelize.Sequelize.Op.or]: [
          { title: { [Document.sequelize.Sequelize.Op.like]: `%${query}%` } },
          { originalText: { [Document.sequelize.Sequelize.Op.like]: `%${query}%` } }
        ]
      },
      attributes: { exclude: ['originalText', 'simplifiedText'] }
    });

    res.json({ success: true, documents: docs, query });
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
};

// Alternative local simplification without OpenAI
const simplifyDocumentLocal = async (req, res) => {
  try {
    const doc = await Document.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (!doc.originalText) return res.status(400).json({ error: 'No text to simplify' });

    // Basic local simplification (regex-based)
    let simplified = doc.originalText
      .replace(/\b(heretofore|hereinafter|whereas|wherefore|hereby|herein|thereof|therein)\b/gi, '')
      .replace(/\b(pursuant to|in accordance with|notwithstanding)\b/gi, 'according to')
      .replace(/\b(shall|will)\b/gi, 'must')
      .replace(/\b(party of the first part|party of the second part)\b/gi, 'party')
      .replace(/\b(aforementioned|aforesaid)\b/gi, 'mentioned')
      .replace(/\s+/g, ' ')
      .trim();

    await doc.update({ simplifiedText: simplified });

    res.json({ 
      success: true, 
      simplifiedText: simplified,
      method: 'local',
      note: 'Simplified using basic text processing due to AI service limitations'
    });
  } catch (error) {
    res.status(500).json({ error: 'Local simplification failed: ' + error.message });
  }
};

const simplifyDocument = async (req, res) => {
  try {
    console.log('Simplify request received:', {
      documentId: req.params.id,
      userId: req.user?.id,
      body: req.body
    });

    // Input validation
    if (!req.params.id) {
      return res.status(400).json({ 
        error: 'Document ID is required',
        details: 'Missing document ID in request parameters'
      });
    }

    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        error: 'User authentication required',
        details: 'No authenticated user found in request'
      });
    }

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.log('OpenAI API key not configured, falling back to local simplification');
      return simplifyDocumentLocal(req, res);
    }

    // Rate limiting check
    if (!rateLimiter.canMakeRequest(req.user.id)) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        details: `You can make ${rateLimiter.maxRequestsPerMinute} requests per minute. Please wait before trying again.`,
        retryAfter: 60
      });
    }

    const { complexity = 'simple', fallbackToLocal = false } = req.body;
    
    // Validate complexity parameter
    const validComplexities = ['simple', 'moderate', 'detailed'];
    if (!validComplexities.includes(complexity)) {
      return res.status(400).json({
        error: 'Invalid complexity level',
        details: `Complexity must be one of: ${validComplexities.join(', ')}`
      });
    }

    console.log('Finding document...');
    const doc = await Document.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!doc) {
      console.log('Document not found:', req.params.id);
      return res.status(404).json({ 
        error: 'Document not found',
        details: 'Document does not exist or you do not have access to it'
      });
    }

    console.log('Document found:', {
      id: doc.id,
      title: doc.title,
      hasOriginalText: !!doc.originalText,
      originalTextLength: doc.originalText?.length || 0,
      hasSimplifiedText: !!doc.simplifiedText
    });

    if (!doc.originalText || doc.originalText.trim().length === 0) {
      return res.status(400).json({ 
        error: 'No text to simplify',
        details: 'Document does not contain extractable text content'
      });
    }

    // Return cached simplified text if available
    if (doc.simplifiedText && doc.simplifiedText.trim().length > 0) {
      console.log('Returning cached simplified text');
      return res.json({ 
        success: true, 
        simplifiedText: doc.simplifiedText,
        cached: true
      });
    }

    // If fallback is requested, use local simplification
    if (fallbackToLocal) {
      console.log('Using local simplification as requested');
      return simplifyDocumentLocal(req, res);
    }

    // Record the request for rate limiting
    rateLimiter.recordRequest(req.user.id);

    // Prepare text for simplification
    const maxTextLength = 2000; // Conservative limit to reduce token usage
    const textToSimplify = doc.originalText.substring(0, maxTextLength);
    
    if (doc.originalText.length > maxTextLength) {
      console.log(`Text truncated from ${doc.originalText.length} to ${maxTextLength} characters`);
    }

    console.log('Calling OpenAI API...');
    
    // Enhanced prompt based on complexity level
    const complexityPrompts = {
      simple: "Rewrite this legal text using simple, everyday language. Keep it brief:",
      moderate: "Simplify this legal text for general understanding. Be concise:",
      detailed: "Simplify this legal text while preserving key information. Be efficient:"
    };

    const prompt = `${complexityPrompts[complexity]}\n\n${textToSimplify}`;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a legal document simplification expert. Be concise and clear."
        },
        {
          role: "user", 
          content: prompt
        }
      ],
      max_tokens: 1000, // Reduced to minimize costs
      temperature: 0.2, // Lower temperature for consistency
    });

    if (!completion.choices || completion.choices.length === 0) {
      throw new Error('No response generated from AI service');
    }

    const simplified = completion.choices[0].message?.content?.trim();
    
    if (!simplified) {
      throw new Error('Empty response from AI service');
    }

    console.log('OpenAI response received, length:', simplified.length);

    // Save simplified text to database
    try {
      await doc.update({ simplifiedText: simplified });
      console.log('Simplified text saved to database');
    } catch (dbError) {
      console.error('Database update error:', dbError);
    }

    res.json({ 
      success: true, 
      simplifiedText: simplified,
      complexity: complexity,
      originalLength: doc.originalText.length,
      simplifiedLength: simplified.length,
      cached: false,
      method: 'ai'
    });

  } catch (error) {
    console.error('Simplification error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      status: error.status
    });

    // Handle specific OpenAI errors
    if (error.code === 'insufficient_quota') {
      // Offer local fallback for quota exceeded
      console.log('OpenAI quota exceeded, offering local fallback');
      return res.status(503).json({
        error: 'AI service quota exceeded',
        details: 'Please try again later, upgrade your plan, or use local simplification',
        fallbackAvailable: true,
        suggestion: 'Add "fallbackToLocal": true to your request body to use basic simplification'
      });
    }

    if (error.code === 'invalid_api_key') {
      console.log('Invalid OpenAI API key, falling back to local simplification');
      return simplifyDocumentLocal(req, res);
    }

    if (error.code === 'rate_limit_exceeded') {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        details: 'Too many requests to AI service. Please wait and try again.',
        retryAfter: 60,
        fallbackAvailable: true
      });
    }

    // Handle network/timeout errors with fallback
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log('Network error, falling back to local simplification');
      return simplifyDocumentLocal(req, res);
    }

    // Generic error response
    res.status(500).json({ 
      error: 'Simplification failed',
      details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
      fallbackAvailable: true
    });
  }
};

const downloadDocument = async (req, res) => {
  try {
    const doc = await Document.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    
    if (!doc || !fs.existsSync(doc.filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    await doc.increment('downloadCount');
    res.download(doc.filePath, doc.originalFileName);
  } catch (error) {
    res.status(500).json({ error: 'Download failed' });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    
    if (fs.existsSync(doc.filePath)) fs.removeSync(doc.filePath);
    await doc.destroy();
    
    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Delete failed' });
  }
};

const getDocumentStats = async (req, res) => {
  try {
    const stats = await Document.findOne({
      where: { userId: req.user.id },
      attributes: [
        [Document.sequelize.fn('COUNT', Document.sequelize.col('id')), 'totalDocs'],
        [Document.sequelize.fn('SUM', Document.sequelize.col('fileSize')), 'totalSize'],
        [Document.sequelize.fn('SUM', Document.sequelize.col('downloadCount')), 'totalDownloads']
      ],
      raw: true
    });

    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ error: 'Stats failed' });
  }
};

module.exports = {
  upload: upload.single('document'),
  uploadDocument,
  getDocuments,
  getDocument,
  searchDocuments,
  simplifyDocument,
  downloadDocument,
  deleteDocument,
  getDocumentStats
};