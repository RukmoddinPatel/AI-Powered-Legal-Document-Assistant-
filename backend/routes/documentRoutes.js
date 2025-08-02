const express = require('express');
const router = express.Router();

const {
  upload,
  uploadDocument,
  getDocuments,
  getDocument,
  searchDocuments,
  simplifyDocument,
  downloadDocument,
  deleteDocument,
  getDocumentStats
} = require('../controllers/documentController');

const { protect } = require('../middleware/authMiddleware');

// ✅ Apply auth middleware to all routes (AFTER defining router)
router.use(protect);

// Upload document
router.post('/upload', upload.single('document'), uploadDocument);

// Get all documents for user
router.get('/', getDocuments);

// Get document statistics
router.get('/stats', getDocumentStats);

// Search documents
router.get('/search', searchDocuments);

// Get specific document
router.get('/:id', getDocument);

// Simplify document
router.post('/:id/simplify', simplifyDocument);

// Download document
router.get('/:id/download', downloadDocument);

// Delete document
router.delete('/:id', deleteDocument);

module.exports = router;
