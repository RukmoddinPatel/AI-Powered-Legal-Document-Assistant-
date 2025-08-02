const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./User');

const Document = sequelize.define('Document', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 255]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  originalFileName: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  fileName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Stored filename on server'
  },
  filePath: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  fileType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      isIn: [['pdf', 'doc', 'docx', 'txt', 'png', 'jpg', 'jpeg']]
    }
  },
  fileSize: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1
    }
  },
  mimeType: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  documentType: {
    type: DataTypes.ENUM(
      'contract',
      'agreement',
      'lease',
      'will',
      'power_of_attorney',
      'court_document',
      'legal_notice',
      'affidavit',
      'deed',
      'license',
      'permit',
      'certificate',
      'other'
    ),
    defaultValue: 'other'
  },
  status: {
    type: DataTypes.ENUM('uploaded', 'processing', 'processed', 'error'),
    defaultValue: 'uploaded'
  },
  originalText: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    comment: 'Extracted text from OCR'
  },
  simplifiedText: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    comment: 'AI-simplified version of the legal text'
  },
  translatedText: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    comment: 'Translated text if translation was requested'
  },
  translatedLanguage: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Language code for translation (e.g., "es", "fr", "hi")'
  },
  keyTerms: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of important legal terms found in the document'
  },
  summary: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'AI-generated summary of the document'
  },
  risks: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of potential risks or important clauses'
  },
  actionItems: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of action items or requirements from the document'
  },
  confidence: {
    type: DataTypes.DECIMAL(5, 4),
    allowNull: true,
    validate: {
      min: 0,
      max: 1
    },
    comment: 'OCR confidence score (0-1)'
  },
  processingTime: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Processing time in milliseconds'
  },
  isPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether document can be shared with others'
  },
  downloadCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  lastAccessed: {
    type: DataTypes.DATE,
    allowNull: true
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'User-defined tags for organization'
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional metadata about the document'
  }
}, {
  tableName: 'documents',
  indexes: [
    {
      fields: ['userId']
    },
    {
      fields: ['status']
    },
    {
      fields: ['documentType']
    },
    {
      fields: ['fileType']
    },
    {
      fields: ['isPublic']
    },
    {
      fields: ['createdAt']
    },
    {
      fields: ['title']
    }
  ]
});

// Define associations
Document.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
  onDelete: 'CASCADE'
});

User.hasMany(Document, {
  foreignKey: 'userId',
  as: 'documents'
});

// Instance methods
Document.prototype.getFileExtension = function() {
  return this.originalFileName.split('.').pop().toLowerCase();
};

Document.prototype.isImage = function() {
  const imageTypes = ['png', 'jpg', 'jpeg', 'gif', 'bmp'];
  return imageTypes.includes(this.fileType);
};

Document.prototype.isProcessed = function() {
  return this.status === 'processed';
};

Document.prototype.incrementDownloadCount = function() {
  return this.increment('downloadCount');
};

Document.prototype.updateLastAccessed = function() {
  return this.update({ lastAccessed: new Date() });
};

// Class methods
Document.findByUser = function(userId, options = {}) {
  return this.findAll({ 
    where: { userId },
    order: [['createdAt', 'DESC']],
    ...options
  });
};

Document.findByType = function(documentType, options = {}) {
  return this.findAll({
    where: { documentType },
    order: [['createdAt', 'DESC']],
    ...options
  });
};

Document.findByStatus = function(status, options = {}) {
  return this.findAll({
    where: { status },
    order: [['createdAt', 'ASC']],
    ...options
  });
};

Document.findPublic = function(options = {}) {
  return this.findAll({
    where: { isPublic: true },
    order: [['createdAt', 'DESC']],
    ...options
  });
};

Document.searchByTitle = function(query, userId = null) {
  const whereClause = {
    title: {
      [sequelize.Sequelize.Op.like]: `%${query}%`
    }
  };
  
  if (userId) {
    whereClause.userId = userId;
  }
  
  return this.findAll({
    where: whereClause,
    order: [['createdAt', 'DESC']]
  });
};

module.exports = Document;