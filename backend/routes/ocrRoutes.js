const express = require('express');
const router = express.Router();
const multer = require('multer');
const { extractText, extractFromDocument } = require('../controllers/ocrController');
const { protect } = require('../middleware/authMiddleware'); // Fixed import

// Configure multer for temporary uploads
const upload = multer({
  dest: 'uploads/temp/',
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and PDF files are allowed.'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// All OCR routes require authentication
router.use(protect); // Fixed: use the protect function instead of authMiddleware

// OCR routes
router.post('/extract', upload.single('document'), extractText);
router.post('/extract/:documentId', extractFromDocument);

module.exports = router;