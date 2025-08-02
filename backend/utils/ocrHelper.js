const Tesseract = require('tesseract.js');
const fs = require('fs').promises;
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');


class OCRHelper {
  constructor() {
    this.supportedImageTypes = ['png', 'jpg', 'jpeg', 'gif', 'bmp'];
    this.supportedDocTypes = ['pdf', 'doc', 'docx', 'txt'];
  }

  // Main method to extract text from any supported file
  async extractText(filePath, fileType) {
    try {
      const startTime = Date.now();
      let result;

      if (this.supportedImageTypes.includes(fileType.toLowerCase())) {
        result = await this.extractFromImage(filePath);
      } else if (fileType.toLowerCase() === 'pdf') {
        result = await this.extractFromPDF(filePath);
      } else if (['doc', 'docx'].includes(fileType.toLowerCase())) {
        result = await this.extractFromWord(filePath);
      } else if (fileType.toLowerCase() === 'txt') {
        result = await this.extractFromText(filePath);
      } else {
        throw new Error(`Unsupported file type: ${fileType}`);
      }

      const processingTime = Date.now() - startTime;
      
      return {
        text: result.text,
        confidence: result.confidence || null,
        processingTime,
        wordCount: this.countWords(result.text),
        characterCount: result.text.length
      };
    } catch (error) {
      console.error('OCR extraction error:', error);
      throw new Error(`Failed to extract text: ${error.message}`);
    }
  }

  // Extract text from images using Tesseract
  async extractFromImage(imagePath) {
    try {
      const { data } = await Tesseract.recognize(imagePath, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });

      return {
        text: data.text,
        confidence: data.confidence / 100 // Convert to 0-1 range
      };
    } catch (error) {
      throw new Error(`Image OCR failed: ${error.message}`);
    }
  }

  // Extract text from PDF files
  async extractFromPDF(pdfPath) {
    try {
      const dataBuffer = await fs.readFile(pdfPath);
      const data = await pdf(dataBuffer);
      
      if (!data.text || data.text.trim().length === 0) {
        // If PDF has no extractable text, it might be image-based
        // In a production environment, you might want to convert PDF pages to images
        // and then use OCR on them
        throw new Error('PDF contains no extractable text. It might be an image-based PDF.');
      }

      return {
        text: data.text,
        confidence: 1.0, // PDF text extraction is generally reliable
        pageCount: data.numpages,
        metadata: data.info
      };
    } catch (error) {
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  // Extract text from Word documents
  async extractFromWord(docPath) {
    try {
      const result = await mammoth.extractRawText({ path: docPath });
      
      if (result.messages.length > 0) {
        console.warn('Word extraction warnings:', result.messages);
      }

      return {
        text: result.value,
        confidence: 1.0, // Word text extraction is generally reliable
        warnings: result.messages
      };
    } catch (error) {
      throw new Error(`Word document extraction failed: ${error.message}`);
    }
  }

  // Extract text from plain text files
  async extractFromText(textPath) {
    try {
      const text = await fs.readFile(textPath, 'utf8');
      
      return {
        text: text,
        confidence: 1.0
      };
    } catch (error) {
      throw new Error(`Text file reading failed: ${error.message}`);
    }
  }

  // Clean and preprocess extracted text
  cleanText(text) {
    if (!text) return '';

    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove special characters that might interfere with processing
      .replace(/[^\w\s\.\,\;\:\!\?\-\(\)\[\]\{\}\"\']/g, '')
      // Trim whitespace
      .trim();
  }

  // Extract key information from legal documents
  extractLegalInfo(text) {
    const info = {
      parties: [],
      dates: [],
      amounts: [],
      addresses: [],
      emails: [],
      phoneNumbers: []
    };

    // Extract dates (various formats)
    const dateRegex = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/gi;
    info.dates = [...new Set((text.match(dateRegex) || []))];

    // Extract monetary amounts
    const amountRegex = /\$[\d,]+(?:\.\d{2})?|\b\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars?|USD|rupees?|INR)\b/gi;
    info.amounts = [...new Set((text.match(amountRegex) || []))];

    // Extract email addresses
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    info.emails = [...new Set((text.match(emailRegex) || []))];

    // Extract phone numbers
    const phoneRegex = /(?:\+\d{1,3}\s?)?(?:\(\d{3}\)|\d{3})[\s\-]?\d{3}[\s\-]?\d{4}/g;
    info.phoneNumbers = [...new Set((text.match(phoneRegex) || []))];

    // Extract addresses (basic pattern)
    const addressRegex = /\d+\s+[A-Za-z0-9\s,]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct)\b[^.]*(?:\d{5}(?:-\d{4})?)?/gi;
    info.addresses = [...new Set((text.match(addressRegex) || []))];

    return info;
  }

  // Identify document type based on content
  identifyDocumentType(text) {
    const lowerText = text.toLowerCase();
    
    const patterns = {
      contract: ['contract', 'agreement', 'parties agree', 'terms and conditions', 'whereas'],
      lease: ['lease', 'tenant', 'landlord', 'rent', 'premises', 'lease term'],
      will: ['last will', 'testament', 'bequest', 'executor', 'beneficiary', 'inherit'],
      power_of_attorney: ['power of attorney', 'attorney-in-fact', 'principal', 'agent', 'authorize'],
      court_document: ['court', 'plaintiff', 'defendant', 'case no', 'docket', 'judgment'],
      legal_notice: ['legal notice', 'notice', 'hereby notified', 'legal action', 'demand'],
      affidavit: ['affidavit', 'sworn statement', 'depose and say', 'under oath', 'notary'],
      deed: ['deed', 'grantor', 'grantee', 'property', 'real estate', 'convey'],
      license: ['license', 'permit', 'authorized', 'certification', 'valid until'],
      certificate: ['certificate', 'certify', 'hereby certified', 'official', 'authorized']
    };

    let bestMatch = 'other';
    let maxMatches = 0;

    for (const [type, keywords] of Object.entries(patterns)) {
      const matches = keywords.filter(keyword => lowerText.includes(keyword)).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        bestMatch = type;
      }
    }

    return {
      type: bestMatch,
      confidence: maxMatches / patterns[bestMatch].length,
      matchedKeywords: patterns[bestMatch].filter(keyword => lowerText.includes(keyword))
    };
  }

  // Extract key terms and legal jargon
  extractKeyTerms(text) {
    const legalTerms = [
      'agreement', 'contract', 'party', 'parties', 'whereas', 'therefore', 'hereby',
      'covenant', 'warranty', 'indemnify', 'liability', 'damages', 'breach',
      'terminate', 'termination', 'clause', 'provision', 'section', 'article',
      'consideration', 'compensation', 'payment', 'fee', 'penalty', 'interest',
      'jurisdiction', 'governing law', 'dispute', 'arbitration', 'mediation',
      'confidential', 'proprietary', 'intellectual property', 'copyright', 'trademark',
      'force majeure', 'act of god', 'waiver', 'amendment', 'modification',
      'assignment', 'transfer', 'successor', 'heir', 'executor', 'beneficiary'
    ];

    const foundTerms = [];
    const lowerText = text.toLowerCase();

    for (const term of legalTerms) {
      if (lowerText.includes(term.toLowerCase())) {
        // Count occurrences
        const regex = new RegExp(`\\b${term.toLowerCase()}\\b`, 'gi');
        const matches = text.match(regex);
        if (matches) {
          foundTerms.push({
            term: term,
            count: matches.length,
            positions: this.findTermPositions(text, term)
          });
        }
      }
    }

    return foundTerms.sort((a, b) => b.count - a.count);
  }

  // Find positions of terms in text
  findTermPositions(text, term) {
    const positions = [];
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    let match;

    while ((match = regex.exec(text)) !== null) {
      positions.push({
        start: match.index,
        end: match.index + match[0].length,
        context: text.substring(
          Math.max(0, match.index - 50),
          Math.min(text.length, match.index + match[0].length + 50)
        ).trim()
      });
    }

    return positions;
  }

  // Count words in text
  countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  // Validate file for OCR processing
  async validateFile(filePath, fileType) {
    try {
      const stats = await fs.stat(filePath);
      
      if (stats.size === 0) {
        throw new Error('File is empty');
      }

      if (stats.size > 50 * 1024 * 1024) { // 50MB limit
        throw new Error('File too large for processing');
      }

      const allSupportedTypes = [...this.supportedImageTypes, ...this.supportedDocTypes];
      if (!allSupportedTypes.includes(fileType.toLowerCase())) {
        throw new Error(`Unsupported file type: ${fileType}`);
      }

      return true;
    } catch (error) {
      throw new Error(`File validation failed: ${error.message}`);
    }
  }
}

module.exports = new OCRHelper();