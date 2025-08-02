const { performOCR } = require('../utils/ocrHelper');
const Document = require('../models/Document');

const extractText = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }

    const { path: filePath } = req.file;

    // Perform OCR
    const extractedText = await performOCR(filePath);

    // Clean up uploaded file (if it's a temporary upload)
    const fs = require('fs').promises;
    try {
      await fs.unlink(filePath);
    } catch (unlinkError) {
      console.error('Failed to clean up file:', unlinkError);
    }

    res.json({
      success: true,
      message: 'Text extracted successfully',
      extractedText
    });
  } catch (error) {
    console.error('OCR error:', error);
    
    // Clean up file on error
    if (req.file && req.file.path) {
      const fs = require('fs').promises;
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Failed to clean up file:', unlinkError);
      }
    }

    res.status(500).json({ 
      success: false, 
      message: 'Failed to extract text from document' 
    });
  }
};

const extractFromDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.userId;

    // Get document
    const document = await Document.findById(documentId);
    if (!document || document.user_id !== userId) {
      return res.status(404).json({ 
        success: false, 
        message: 'Document not found' 
      });
    }

    // Check if text already extracted
    if (document.extracted_text) {
      return res.json({
        success: true,
        message: 'Text already extracted',
        extractedText: document.extracted_text
      });
    }

    // Update status
    await Document.updateStatus(documentId, 'processing');

    try {
      // Perform OCR
      const extractedText = await performOCR(document.file_path);

      // Update document
      await Document.updateExtractedText(documentId, extractedText);

      res.json({
        success: true,
        message: 'Text extracted successfully',
        extractedText
      });
    } catch (ocrError) {
      console.error('OCR processing error:', ocrError);
      await Document.updateStatus(documentId, 'failed');
      
      res.status(500).json({ 
        success: false, 
        message: 'Failed to extract text from document' 
      });
    }
  } catch (error) {
    console.error('Extract from document error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

module.exports = {
  extractText,
  extractFromDocument
};
