const express = require('express');
const multer = require('multer');
const { protect } = require('../middleware/authMiddleware');
const OCR = require('../utils/ocrHelper');

const router = express.Router();
const upload = multer({ dest: 'uploads/temp/', limits: { fileSize: 10 * 1024 * 1024 } });

router.use(protect);

router.post('/extract', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    
    const result = await OCR.extractText(req.file.path, req.file.mimetype.split('/')[1]);
    res.json({ success: true, extractedText: result.text });
  } catch (error) {
    res.status(500).json({ error: 'OCR failed: ' + error.message });
  }
});

module.exports = router;