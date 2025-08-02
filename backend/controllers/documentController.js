const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const Document = require('../models/Document');
const { extractText, cleanExtractedText } = require('../utils/ocrHelper');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/documents';
    fs.ensureDirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { title, language = 'en', tags } = req.body;
    const { uid } = req.user;

    // Extract text from the uploaded document
    const extractedText = await extractText(
      req.file.path,
      req.file.mimetype,
      language
    );

    const cleanedText = cleanExtractedText(extractedText);

    // Save document to database
    const documentId = await Document.create({
      firebase_uid: uid,
      title: title || req.file.originalname,
      original_filename: req.file.originalname,
      file_path: req.file.path,
      file_type: req.file.mimetype,
      file_size: req.file.size,
      language,
      extracted_text: cleanedText,
      tags: tags ? JSON.parse(tags) : []
    });

    res.status(201).json({
      message: 'Document uploaded successfully',
      documentId,
      extractedTextLength: cleanedText ? cleanedText.length : 0
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up uploaded file on error
    if (req.file) {
      fs.removeSync(req.file.path);
    }

    res.status(500).json({ error: 'Failed to upload document' });
  }
};

const getDocuments = async (req, res) => {
  try {
    const { uid } = req.user;
    const { page = 1, limit = 20 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const documents = await Document.findByUserId(uid, parseInt(limit), offset);

    res.status(200).json({ documents });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
};

const getDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { uid } = req.user;

    const document = await Document.findById(id, uid);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.status(200).json({ document });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
};

const searchDocuments = async (req, res) => {
  try {
    const { uid } = req.user;
    const { q: query, language } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const documents = await Document.search(uid, query, language);
    res.status(200).json({ documents, query });
  } catch (error) {
    console.error('Search documents error:', error);
    res.status(500).json({ error: 'Failed to search documents' });
  }
};

const simplifyDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { uid } = req.user;
    const { language = 'en', complexity = 'simple' } = req.body;

    const document = await Document.findById(id, uid);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!document.extracted_text) {
      return res.status(400).json({ error: 'No text content available for simplification' });
    }

    // Check if already simplified
    if (document.simplified_text) {
      return res.status(200).json({
        message: 'Document already simplified',
        simplifiedText: document.simplified_text
      });
    }

    const prompt = generateSimplificationPrompt(document.extracted_text, language, complexity);

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a legal document simplification assistant. Simplify complex legal language while preserving important legal meanings."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.3
      });

      const simplifiedText = completion.choices[0].message.content.trim();

      // Save simplified text to database
      await Document.updateSimplifiedText(id, uid, simplifiedText);

      res.status(200).json({
        message: 'Document simplified successfully',
        simplifiedText
      });

    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError);
      res.status(500).json({ error: 'Failed to simplify document using AI' });
    }

  } catch (error) {
    console.error('Simplify document error:', error);
    res.status(500).json({ error: 'Failed to simplify document' });
  }
};

const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { uid } = req.user;

    const document = await Document.findById(id, uid);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!fs.existsSync(document.file_path)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    res.download(document.file_path, document.original_filename);
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { uid } = req.user;

    const document = await Document.findById(id, uid);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete file from filesystem
    if (fs.existsSync(document.file_path)) {
      fs.removeSync(document.file_path);
    }

    // Delete from database
    await Document.delete(id, uid);

    res.status(200).json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
};

const getDocumentStats = async (req, res) => {
  try {
    const { uid } = req.user;
    const stats = await Document.getStats(uid);
    res.status(200).json({ stats });
  } catch (error) {
    console.error('Get document stats error:', error);
    res.status(500).json({ error: 'Failed to fetch document statistics' });
  }
};

const generateSimplificationPrompt = (text, language, complexity) => {
  const languageNames = {
    'en': 'English',
    'hi': 'Hindi',
    'bn': 'Bengali',
    'te': 'Telugu',
    'ta': 'Tamil',
    'gu': 'Gujarati',
    'kn': 'Kannada',
    'ml': 'Malayalam',
    'mr': 'Marathi',
    'pa': 'Punjabi'
  };

  const complexityLevels = {
    'simple': 'very simple language suitable for general public',
    'intermediate': 'moderately simple language for educated readers',
    'technical': 'simplified but retaining technical accuracy'
  };

  const targetLanguage = languageNames[language] || 'English';
  const complexityLevel = complexityLevels[complexity] || 'simple language';

  return `Please simplify the following legal document text. 
  
Requirements:
- Use ${complexityLevel}
- Respond in ${targetLanguage}
- Preserve all important legal meanings and obligations
- Break down complex sentences into simpler ones
- Explain legal jargon in plain terms
- Maintain the document structure but make it more readable
- Keep important dates, names, and numbers intact

Legal Document Text:
${text.substring(0, 3000)}${text.length > 3000 ? '...' : ''}

Simplified Version:`;
};

module.exports = {
  upload,
  uploadDocument,
  getDocuments,
  getDocument,
  searchDocuments,
  simplifyDocument,
  downloadDocument,
  deleteDocument,
  getDocumentStats
};