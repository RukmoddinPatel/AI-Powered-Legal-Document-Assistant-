// controllers/judgeController.js
const { JudgeDocument, User } = require('../models');
const { uploadToBlockchain, verifyDocumentHash, getDocumentFromBlockchain } = require('../utils/blockchainHelper');
const { generateDocumentHash, verifyFileIntegrity } = require('../utils/cryptoHelper');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

class JudgeController {
  // Upload court document to blockchain
  async uploadDocument(req, res) {
    try {
      const { title, category, caseNumber, accessLevel = 'restricted', authorizedLawyers = [], validUntil } = req.body;
      const judgeId = req.user.id;

      // Verify user is a judge
      if (req.user.role !== 'judge') {
        return res.status(403).json({ error: 'Only judges can upload court documents' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Document file is required' });
      }

      const file = req.file;
      
      // Generate secure hash for the document
      const documentHash = await generateDocumentHash(file.path);
      
      // Check if document with same hash already exists
      const existingDoc = await JudgeDocument.findOne({
        where: { documentHash }
      });

      if (existingDoc) {
        return res.status(409).json({ 
          error: 'Document already exists in the system',
          existingDocumentId: existingDoc.id
        });
      }

      // Upload to blockchain
      const blockchainResult = await uploadToBlockchain({
        documentHash,
        title,
        category,
        caseNumber,
        judgeId,
        uploadedAt: new Date().toISOString(),
        metadata: {
          fileName: file.originalname,
          fileSize: file.size,
          fileType: file.mimetype
        }
      });

      // Create database record
      const judgeDocument = await JudgeDocument.create({
        judgeId,
        title,
        documentHash,
        blockchainTxId: blockchainResult.transactionId,
        fileName: file.originalname,
        filePath: file.path,
        fileType: file.mimetype,
        category,
        caseNumber,
        accessLevel,
        authorizedLawyers: Array.isArray(authorizedLawyers) ? authorizedLawyers : [],
        validUntil: validUntil ? new Date(validUntil) : null,
        isActive: true
      });

      res.json({
        success: true,
        document: {
          id: judgeDocument.id,
          title: judgeDocument.title,
          documentHash: judgeDocument.documentHash,
          blockchainTxId: judgeDocument.blockchainTxId,
          category: judgeDocument.category,
          caseNumber: judgeDocument.caseNumber,
          accessLevel: judgeDocument.accessLevel,
          createdAt: judgeDocument.createdAt
        },
        message: 'Document successfully uploaded to blockchain'
      });
    } catch (error) {
      console.error('Upload document error:', error);
      res.status(500).json({
        error: 'Failed to upload document to blockchain',
        details: error.message
      });
    }
  }

  // Get document using hash (for lawyers)
  async getDocumentByHash(req, res) {
    try {
      const { documentHash } = req.params;
      const userId = req.user.id;

      const document = await JudgeDocument.findOne({
        where: { documentHash, isActive: true },
        include: [{
          model: User,
          as: 'judge',
          attributes: ['id', 'firstName', 'lastName', 'specialization']
        }]
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Check access permissions
      const hasAccess = this.checkDocumentAccess(document, userId, req.user.role);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this document' });
      }

      // Check if document is still valid
      if (document.validUntil && new Date() > document.validUntil) {
        return res.status(410).json({ error: 'Document access has expired' });
      }

      // Verify document integrity with blockchain
      const isValid = await verifyDocumentHash(documentHash, document.blockchainTxId);
      if (!isValid) {
        return res.status(422).json({ error: 'Document integrity verification failed' });
      }

      // Increment download count
      await document.increment('downloadCount');

      // Return document metadata (not the actual file for security)
      res.json({
        success: true,
        document: {
          id: document.id,
          title: document.title,
          documentHash: document.documentHash,
          category: document.category,
          caseNumber: document.caseNumber,
          fileName: document.fileName,
          fileType: document.fileType,
          accessLevel: document.accessLevel,
          validUntil: document.validUntil,
          downloadCount: document.downloadCount + 1,
          createdAt: document.createdAt,
          judge: {
            name: `${document.judge.firstName} ${document.judge.lastName}`,
            specialization: document.judge.specialization
          }
        },
        blockchainVerified: true
      });
    } catch (error) {
      console.error('Get document by hash error:', error);
      res.status(500).json({
        error: 'Failed to retrieve document',
        details: error.message
      });
    }
  }

  // Download actual document file
  async downloadDocument(req, res) {
    try {
      const { documentHash } = req.params;
      const userId = req.user.id;

      const document = await JudgeDocument.findOne({
        where: { documentHash, isActive: true }
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Check access permissions
      const hasAccess = this.checkDocumentAccess(document, userId, req.user.role);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this document' });
      }

      // Check if document is still valid
      if (document.validUntil && new Date() > document.validUntil) {
        return res.status(410).json({ error: 'Document access has expired' });
      }

      // Verify file integrity
      const fileExists = await fs.access(document.filePath).then(() => true).catch(() => false);
      if (!fileExists) {
        return res.status(404).json({ error: 'Document file not found on server' });
      }

      const currentHash = await generateDocumentHash(document.filePath);
      if (currentHash !== document.documentHash) {
        return res.status(422).json({ error: 'Document file has been tampered with' });
      }

      // Set appropriate headers for file download
      res.setHeader('Content-Type', document.fileType);
      res.setHeader('Content-Disposition', `attachment; filename="${document.fileName}"`);
      
      // Stream the file
      const fileStream = require('fs').createReadStream(document.filePath);
      fileStream.pipe(res);

      // Log the download
      await document.increment('downloadCount');
    } catch (error) {
      console.error('Download document error:', error);
      res.status(500).json({
        error: 'Failed to download document',
        details: error.message
      });
    }
  }

  // Get judge's uploaded documents
  async getJudgeDocuments(req, res) {
    try {
      const judgeId = req.user.id;
      const { page = 1, limit = 10, category, caseNumber, status = 'active' } = req.query;
      const offset = (page - 1) * limit;

      if (req.user.role !== 'judge') {
        return res.status(403).json({ error: 'Only judges can view their documents' });
      }

      let whereClause = { judgeId };

      if (category) {
        whereClause.category = category;
      }

      if (caseNumber) {
        whereClause.caseNumber = { [Op.iLike]: `%${caseNumber}%` };
      }

      if (status === 'active') {
        whereClause.isActive = true;
      } else if (status === 'expired') {
        whereClause.validUntil = { [Op.lt]: new Date() };
      }

      const { count, rows: documents } = await JudgeDocument.findAndCountAll({
        where: whereClause,
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset),
        attributes: [
          'id', 'title', 'documentHash', 'category', 'caseNumber',
          'accessLevel', 'downloadCount', 'validUntil', 'isActive',
          'createdAt', 'authorizedLawyers'
        ]
      });

      res.json({
        success: true,
        documents: documents.map(doc => ({
          ...doc.toJSON(),
          isExpired: doc.validUntil && new Date() > doc.validUntil,
          authorizedLawyersCount: doc.authorizedLawyers ? doc.authorizedLawyers.length : 0
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      console.error('Get judge documents error:', error);
      res.status(500).json({
        error: 'Failed to fetch judge documents',
        details: error.message
      });
    }
  }

  // Update document access permissions
  async updateDocumentAccess(req, res) {
    try {
      const { documentId } = req.params;
      const { accessLevel, authorizedLawyers, validUntil } = req.body;
      const judgeId = req.user.id;

      if (req.user.role !== 'judge') {
        return res.status(403).json({ error: 'Only judges can update document access' });
      }

      const document = await JudgeDocument.findOne({
        where: { id: documentId, judgeId }
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const updateData = {};
      
      if (accessLevel) {
        updateData.accessLevel = accessLevel;
      }
      
      if (authorizedLawyers !== undefined) {
        updateData.authorizedLawyers = Array.isArray(authorizedLawyers) ? authorizedLawyers : [];
      }
      
      if (validUntil !== undefined) {
        updateData.validUntil = validUntil ? new Date(validUntil) : null;
      }

      await document.update(updateData);

      res.json({
        success: true,
        document: {
          id: document.id,
          title: document.title,
          accessLevel: document.accessLevel,
          authorizedLawyers: document.authorizedLawyers,
          validUntil: document.validUntil
        },
        message: 'Document access updated successfully'
      });
    } catch (error) {
      console.error('Update document access error:', error);
      res.status(500).json({
        error: 'Failed to update document access',
        details: error.message
      });
    }
  }

  // Revoke document access
  async revokeDocument(req, res) {
    try {
      const { documentId } = req.params;
      const judgeId = req.user.id;

      if (req.user.role !== 'judge') {
        return res.status(403).json({ error: 'Only judges can revoke documents' });
      }

      const document = await JudgeDocument.findOne({
        where: { id: documentId, judgeId }
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      await document.update({ isActive: false });

      res.json({
        success: true,
        message: 'Document access revoked successfully'
      });
    } catch (error) {
      console.error('Revoke document error:', error);
      res.status(500).json({
        error: 'Failed to revoke document',
        details: error.message
      });
    }
  }

  // Search accessible documents (for lawyers)
  async searchAccessibleDocuments(req, res) {
    try {
      const { query, category, court, judge, page = 1, limit = 10 } = req.query;
      const userId = req.user.id;
      const offset = (page - 1) * limit;

      let whereClause = {
        isActive: true,
        [Op.or]: [
          { accessLevel: 'public' },
          { authorizedLawyers: { [Op.contains]: [userId] } }
        ]
      };

      // Add search filters
      if (category) {
        whereClause.category = category;
      }

      if (query) {
        whereClause[Op.or] = [
          { title: { [Op.iLike]: `%${query}%` } },
          { caseNumber: { [Op.iLike]: `%${query}%` } }
        ];
      }

      const { count, rows: documents } = await JudgeDocument.findAndCountAll({
        where: whereClause,
        include: [{
          model: User,
          as: 'judge',
          attributes: ['firstName', 'lastName', 'specialization'],
          where: judge ? {
            [Op.or]: [
              { firstName: { [Op.iLike]: `%${judge}%` } },
              { lastName: { [Op.iLike]: `%${judge}%` } }
            ]
          } : undefined
        }],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset),
        attributes: [
          'id', 'title', 'documentHash', 'category', 'caseNumber',
          'accessLevel', 'downloadCount', 'validUntil', 'createdAt'
        ]
      });

      res.json({
        success: true,
        documents: documents.map(doc => ({
          ...doc.toJSON(),
          judge: `${doc.judge.firstName} ${doc.judge.lastName}`,
          judgeSpecialization: doc.judge.specialization,
          isExpired: doc.validUntil && new Date() > doc.validUntil
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      console.error('Search accessible documents error:', error);
      res.status(500).json({
        error: 'Failed to search documents',
        details: error.message
      });
    }
  }

  // Helper method to check document access
  checkDocumentAccess(document, userId, userRole) {
    // Judges can always access their own documents
    if (userRole === 'judge' && document.judgeId === userId) {
      return true;
    }

    // Public documents are accessible to all
    if (document.accessLevel === 'public') {
      return true;
    }

    // Check if user is in authorized lawyers list
    if (document.authorizedLawyers && document.authorizedLawyers.includes(userId)) {
      return true;
    }

    return false;
  }

  // Get blockchain verification status
  async verifyDocumentIntegrity(req, res) {
    try {
      const { documentHash } = req.params;

      const document = await JudgeDocument.findOne({
        where: { documentHash }
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Verify with blockchain
      const blockchainVerification = await verifyDocumentHash(documentHash, document.blockchainTxId);
      
      // Verify file integrity
      let fileIntegrityStatus = 'unknown';
      try {
        const currentHash = await generateDocumentHash(document.filePath);
        fileIntegrityStatus = currentHash === documentHash ? 'valid' : 'compromised';
      } catch (error) {
        fileIntegrityStatus = 'file_not_found';
      }

      res.json({
        success: true,
        verification: {
          documentHash,
          blockchainTxId: document.blockchainTxId,
          blockchainVerified: blockchainVerification,
          fileIntegrity: fileIntegrityStatus,
          uploadedAt: document.createdAt,
          lastVerified: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Verify document integrity error:', error);
      res.status(500).json({
        error: 'Failed to verify document integrity',
        details: error.message
      });
    }
  }
}

module.exports = new JudgeController();