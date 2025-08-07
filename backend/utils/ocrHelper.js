const Tesseract = require('tesseract.js');
const fs = require('fs').promises;
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

class OCRHelper {
  async extractText(filePath, fileType) {
    try {
      const start = Date.now();
      let result;

      switch (fileType.toLowerCase()) {
        case 'png':
        case 'jpg':
        case 'jpeg':
          result = await this.fromImage(filePath);
          break;
        case 'pdf':
          result = await this.fromPDF(filePath);
          break;
        case 'doc':
        case 'docx':
          result = await this.fromWord(filePath);
          break;
        case 'txt':
          result = await this.fromText(filePath);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }

      return {
        text: result.text,
        confidence: result.confidence || 1.0,
        processingTime: Date.now() - start,
        wordCount: this.countWords(result.text)
      };
    } catch (error) {
      throw new Error(`OCR failed: ${error.message}`);
    }
  }

  async fromImage(path) {
    const { data } = await Tesseract.recognize(path, 'eng', {
      logger: m => console.log(`OCR: ${Math.round(m.progress * 100)}%`)
    });
    return { text: data.text, confidence: data.confidence / 100 };
  }

  async fromPDF(path) {
    const buffer = await fs.readFile(path);
    const data = await pdf(buffer);
    
    if (!data.text?.trim()) {
      throw new Error('PDF contains no extractable text');
    }
    
    return { text: data.text, confidence: 1.0 };
  }

  async fromWord(path) {
    const result = await mammoth.extractRawText({ path });
    return { text: result.value, confidence: 1.0 };
  }

  async fromText(path) {
    const text = await fs.readFile(path, 'utf8');
    return { text, confidence: 1.0 };
  }

  countWords(text) {
    return text ? text.trim().split(/\s+/).length : 0;
  }
}

module.exports = new OCRHelper();