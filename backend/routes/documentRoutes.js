const express = require('express');
const {
  upload, uploadDocument, getDocuments, getDocument,
  searchDocuments, simplifyDocument, downloadDocument,
  deleteDocument, getDocumentStats
} = require('../controllers/documentController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.post('/upload', upload, uploadDocument);
router.get('/stats', getDocumentStats);
router.get('/search', searchDocuments);
router.get('/:id/download', downloadDocument);
router.post('/:id/simplify', simplifyDocument);
router.get('/:id', getDocument);
router.delete('/:id', deleteDocument);
router.get('/', getDocuments);

module.exports = router;