const JudgeDocument = require('../models/JudgeDocument');
const User = require('../models/User');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const { authorize } = require('../middleware/authMiddleware');

// File upload configuration for judges
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = 'uploads/judge-documents';
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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit for court documents
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and DOC files are allowed for court documents.'));
    }
  }
}).single('document');

// Generate document hash for blockchain verification
const generateDocumentHash = (fileBuffer, metadata) => {
  const combinedData = Buffer.concat([
    fileBuffer,
    Buffer.from(JSON.stringify(metadata))
  ]);
  return crypto.createHash('sha256').update(combinedData).digest('hex');
};

// Simulate blockchain transaction (In production, integrate with actual blockchain)
const simulateBlockchainTransaction = async (documentHash, metadata) => {
  // This would integrate with actual blockchain like Hyperledger Fabric
  // For now, we simulate the transaction ID
  const txId = 'TX' + Date.now() + Math.random().toString(36).substring(7);
  
  console.log(`[Blockchain] Document registered with hash: ${documentHash}`);
  console.log(`[Blockchain] Transaction ID: ${txId}`);
  
  return {
    transactionId: txId,
    blockHash: crypto.createHash('sha256').update(txId + documentHash).digest('hex'),
    timestamp: new Date().toISOString()
  };
};

// Upload judge document with blockchain verification
const uploadJudgeDocument = async (req, res) => {
  try {
    // Only judges can upload documents
    if (req.user.role !== 'judge') {
      return res.status(403).json({ 
        success: false, 
        message: 'Only judges can upload court documents' 
      });
    }

    const { 
      title, 
      category, 
      caseNumber, 
      accessLevel = 'restricted', 
      authorizedLawyers = [], 
      validUntil 
    } = req.body;

    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No document uploaded' });
    }

    // Read file for hash generation
    const fileBuffer = await fs.readFile(file.path);
    
    // Generate document metadata
    const metadata = {
      title,
      category,
      caseNumber,
      judgeId: req.user.id,
      timestamp: new Date().toISOString()
    };

    // Generate document hash
    const documentHash = generateDocumentHash(fileBuffer, metadata);

    // Register on blockchain (simulated)
    const blockchainTx = await simulateBlockchainTransaction(documentHash, metadata);

    // Parse authorized lawyers if provided
    let authorizedLawyerIds = [];
    if (authorizedLawyers && authorizedLawyers.length > 0) {
      try {
        authorizedLawyerIds = typeof authorizedLawyers === 'string' 
          ? JSON.parse(authorizedLawyers) 
          : authorizedLawyers;
      } catch (e) {
        console.warn('Invalid authorized lawyers format');
      }
    }

    // Create document record
    const judgeDocument = await JudgeDocument.create({
      judgeId: req.user.id,
      title: title || file.originalname,
      documentHash,
      blockchainTxId: blockchainTx.transactionId,
      fileName: file.originalname,
      filePath: file.path,
      fileType: path.extname(file.originalname).substring(1),
      category: category || 'other',
      caseNumber,
      accessLevel,
      authorizedLawyers: authorizedLawyerIds,
      validUntil: validUntil ? new Date(validUntil) : null,
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded and registered on blockchain successfully',
      document: {
        id: judgeDocument.id,
        title: judgeDocument.title,
        documentHash: judgeDocument.documentHash,
        blockchainTxId: judgeDocument.blockchainTxId,
        category: judgeDocument.category,
        caseNumber: judgeDocument.caseNumber,
        accessLevel: judgeDocument.accessLevel
      }
    });
  } catch (error) {
    console.error('Judge document upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get judge's documents
const getJudgeDocuments = async (req, res) => {
  try {
    if (req.user.role !== 'judge') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Judges only.' 
      });
    }

    const { page = 1, limit = 10, category, isActive } = req.query;
    const offset = (page - 1) * limit;

    const where = { judgeId: req.user.id };
    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const documents = await JudgeDocument.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'judge',
        attributes: ['firstName', 'lastName', 'email']
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
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

// Get accessible documents for lawyers
const getAccessibleDocuments = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, caseNumber } = req.query;
    const offset = (page - 1) * limit;

    let where = {
      isActive: true,
      [Op.or]: [
        { accessLevel: 'public' },
        { 
          accessLevel: 'restricted',
          authorizedLawyers: {
            [Op.contains]: [req.user.id]
          }
        }
      ]
    };

    // Add expiry check
    where.validUntil = {
      [Op.or]: [
        { [Op.is]: null },
        { [Op.gte]: new Date() }
      ]
    };

    if (category) where.category = category;
    if (caseNumber) where.caseNumber = { [Op.like]: `%${caseNumber}%` };

    const documents = await JudgeDocument.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'judge',
        attributes: ['firstName', 'lastName']
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      attributes: { exclude: ['filePath'] } // Don't expose file paths
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

// Verify document integrity using blockchain hash
const verifyDocumentIntegrity = async (req, res) => {
  try {
    const { documentHash } = req.params;

    const document = await JudgeDocument.findOne({
      where: { documentHash },
      include: [{
        model: User,
        as: 'judge',
        attributes: ['firstName', 'lastName', 'email']
      }]
    });

    if (!document) {
      return res.status(404).json({ 
        success: false, 
        message: 'Document not found in blockchain registry' 
      });
    }

    // Check if user has access to this document
    const hasAccess = document.accessLevel === 'public' || 
                     document.judgeId === req.user.id ||
                     (document.authorizedLawyers && document.authorizedLawyers.includes(req.user.id));

    if (!hasAccess) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied to this document' 
      });
    }

    // In production, verify with actual blockchain
    const isValid = document.blockchainTxId && document.documentHash;

    res.json({
      success: true,
      verified: isValid,
      document: {
        title: document.title,
        category: document.category,
        caseNumber: document.caseNumber,
        judge: document.judge ? 
          `${document.judge.firstName} ${document.judge.lastName}` : 'Unknown',
        blockchainTxId: document.blockchainTxId,
        createdAt: document.createdAt,
        validUntil: document.validUntil
      },
      verification: {
        hashMatches: true, // In production, verify actual file hash
        blockchainVerified: isValid,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Download judge document (with access control)
const downloadJudgeDocument = async (req, res) => {
  try {
    const document = await JudgeDocument.findByPk(req.params.id);

    if (!document || !document.isActive) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    // Check access permissions
    const hasAccess = document.accessLevel === 'public' || 
                     document.judgeId === req.user.id ||
                     (document.authorizedLawyers && document.authorizedLawyers.includes(req.user.id));

    if (!hasAccess) {
      return res.status(403).json({ 
        success: false, 
        message: 'You are not authorized to access this document' 
      });
    }

    // Check expiry
    if (document.validUntil && new Date() > document.validUntil) {
      return res.status(410).json({ 
        success: false, 
        message: 'Document access has expired' 
      });
    }

    // Increment download count
    await document.increment('downloadCount');

    // Log access for audit trail
    console.log(`[Audit] Document ${document.id} accessed by user ${req.user.id} at ${new Date().toISOString()}`);

    res.download(document.filePath, document.fileName);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update document access permissions (judges only)
const updateDocumentAccess = async (req, res) => {
  try {
    const { accessLevel, authorizedLawyers, validUntil } = req.body;

    const document = await JudgeDocument.findOne({
      where: { id: req.params.id, judgeId: req.user.id }
    });

    if (!document) {
      return res.status(404).json({ 
        success: false, 
        message: 'Document not found or access denied' 
      });
    }

    const updateData = {};
    if (accessLevel) updateData.accessLevel = accessLevel;
    if (authorizedLawyers) updateData.authorizedLawyers = authorizedLawyers;
    if (validUntil) updateData.validUntil = new Date(validUntil);

    await document.update(updateData);

    res.json({
      success: true,
      message: 'Document access updated successfully',
      document: {
        id: document.id,
        accessLevel: document.accessLevel,
        authorizedLawyers: document.authorizedLawyers,
        validUntil: document.validUntil
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Deactivate document
const deactivateDocument = async (req, res) => {
  try {
    const document = await JudgeDocument.findOne({
      where: { id: req.params.id, judgeId: req.user.id }
    });

    if (!document) {
      return res.status(404).json({ 
        success: false, 
        message: 'Document not found or access denied' 
      });
    }

    await document.update({ isActive: false });

    res.json({
      success: true,
      message: 'Document deactivated successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  upload,
  uploadJudgeDocument,
  getJudgeDocuments,
  getAccessibleDocuments,
  verifyDocumentIntegrity,
  downloadJudgeDocument,
  updateDocumentAccess,
  deactivateDocument
};