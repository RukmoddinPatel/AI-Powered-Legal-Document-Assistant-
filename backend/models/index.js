// models/index.js - Main models file
const { Sequelize } = require('sequelize');
const sequelize = require('../config/db');

// Import all models
const User = require('./User');
const Document = require('./Document');
const AvailableDocument = require('./AvailableDocument');
const Query = require('./Query');
const JudgeDocument = require('./JudgeDocument');
const DraftTemplate = require('./DraftTemplate');
const AdvocateDiary = require('./AdvocateDiary');
const CaseSchedule = require('./CaseSchedule');
const DocumentTranslation = require('./DocumentTranslation');
const QueryResponse = require('./QueryResponse');

// Initialize models
const models = {
  User: User(sequelize, Sequelize.DataTypes),
  Document: Document(sequelize, Sequelize.DataTypes),
  AvailableDocument: AvailableDocument(sequelize, Sequelize.DataTypes),
  Query: Query(sequelize, Sequelize.DataTypes),
  JudgeDocument: JudgeDocument(sequelize, Sequelize.DataTypes),
  DraftTemplate: DraftTemplate(sequelize, Sequelize.DataTypes),
  AdvocateDiary: AdvocateDiary(sequelize, Sequelize.DataTypes),
  CaseSchedule: CaseSchedule(sequelize, Sequelize.DataTypes),
  DocumentTranslation: DocumentTranslation(sequelize, Sequelize.DataTypes),
  QueryResponse: QueryResponse(sequelize, Sequelize.DataTypes)
};

// Define associations
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// User associations
models.User.hasMany(models.Document, { foreignKey: 'userId', as: 'documents' });
models.User.hasMany(models.Query, { foreignKey: 'userId', as: 'queries' });
models.User.hasMany(models.AdvocateDiary, { foreignKey: 'userId', as: 'diaryEntries' });
models.User.hasMany(models.CaseSchedule, { foreignKey: 'userId', as: 'schedules' });

// Document associations
models.Document.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
models.Document.hasMany(models.DocumentTranslation, { foreignKey: 'documentId', as: 'translations' });

// Query associations
models.Query.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
models.Query.hasMany(models.QueryResponse, { foreignKey: 'queryId', as: 'responses' });

// Other associations
models.JudgeDocument.belongsTo(models.User, { foreignKey: 'judgeId', as: 'judge' });
models.AdvocateDiary.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
models.CaseSchedule.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
models.DocumentTranslation.belongsTo(models.Document, { foreignKey: 'documentId', as: 'document' });
models.QueryResponse.belongsTo(models.Query, { foreignKey: 'queryId', as: 'query' });

models.sequelize = sequelize;
models.Sequelize = Sequelize;

module.exports = models;

// models/User.js
const bcrypt = require('bcryptjs');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [2, 50]
      }
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [2, 50]
      }
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [6, 100]
      }
    },
    role: {
      type: DataTypes.ENUM('lawyer', 'judge', 'client'),
      defaultValue: 'lawyer'
    },
    barId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    specialization: {
      type: DataTypes.STRING,
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    profileImage: {
      type: DataTypes.STRING,
      allowNull: true
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    timestamps: true,
    hooks: {
      beforeCreate: async (user) => {
        user.password = await bcrypt.hash(user.password, 12);
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, 12);
        }
      }
    }
  });

  User.prototype.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  };

  return User;
};

// models/Document.js
module.exports = (sequelize, DataTypes) => {
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
        model: 'Users',
        key: 'id'
      }
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    fileName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    filePath: {
      type: DataTypes.STRING,
      allowNull: false
    },
    fileType: {
      type: DataTypes.STRING,
      allowNull: false
    },
    fileSize: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    extractedText: {
      type: DataTypes.TEXT('long'),
      allowNull: true
    },
    summary: {
      type: DataTypes.TEXT('long'),
      allowNull: true
    },
    simplifiedText: {
      type: DataTypes.TEXT('long'),
      allowNull: true
    },
    category: {
      type: DataTypes.ENUM('contract', 'lawsuit', 'agreement', 'court_order', 'legal_notice', 'other'),
      defaultValue: 'other'
    },
    tags: {
      type: DataTypes.JSON,
      allowNull: true
    },
    isProcessed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    processingStatus: {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
      defaultValue: 'pending'
    },
    ocrConfidence: {
      type: DataTypes.FLOAT,
      allowNull: true
    }
  }, {
    timestamps: true
  });

  return Document;
};

// models/AvailableDocument.js
module.exports = (sequelize, DataTypes) => {
  const AvailableDocument = sequelize.define('AvailableDocument', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    caseNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    court: {
      type: DataTypes.STRING,
      allowNull: false
    },
    judge: {
      type: DataTypes.STRING,
      allowNull: false
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    category: {
      type: DataTypes.ENUM('civil', 'criminal', 'constitutional', 'commercial', 'family', 'tax', 'labor', 'other'),
      allowNull: false
    },
    keywords: {
      type: DataTypes.JSON,
      allowNull: true
    },
    summary: {
      type: DataTypes.TEXT('long'),
      allowNull: false
    },
    fullText: {
      type: DataTypes.TEXT('long'),
      allowNull: false
    },
    citation: {
      type: DataTypes.STRING,
      allowNull: true
    },
    relevanceScore: {
      type: DataTypes.FLOAT,
      defaultValue: 0.0
    },
    downloadCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    filePath: {
      type: DataTypes.STRING,
      allowNull: true
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    timestamps: true,
    indexes: [
      {
        fields: ['category', 'year']
      },
      {
        fields: ['keywords'],
        using: 'gin',
        operator: 'jsonb_path_ops'
      }
    ]
  });

  return AvailableDocument;
};

// models/Query.js
module.exports = (sequelize, DataTypes) => {
  const Query = sequelize.define('Query', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    question: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    context: {
      type: DataTypes.JSON,
      allowNull: true
    },
    category: {
      type: DataTypes.ENUM('legal_advice', 'case_analysis', 'document_review', 'general', 'other'),
      defaultValue: 'general'
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
      defaultValue: 'medium'
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
      defaultValue: 'pending'
    },
    sessionId: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    timestamps: true
  });

  return Query;
};

// models/QueryResponse.js
module.exports = (sequelize, DataTypes) => {
  const QueryResponse = sequelize.define('QueryResponse', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    queryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Queries',
        key: 'id'
      }
    },
    response: {
      type: DataTypes.TEXT('long'),
      allowNull: false
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    sources: {
      type: DataTypes.JSON,
      allowNull: true
    },
    processingTime: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    timestamps: true
  });

  return QueryResponse;
};

// models/JudgeDocument.js
module.exports = (sequelize, DataTypes) => {
  const JudgeDocument = sequelize.define('JudgeDocument', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    judgeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    documentHash: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    blockchainTxId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    fileName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    filePath: {
      type: DataTypes.STRING,
      allowNull: false
    },
    fileType: {
      type: DataTypes.STRING,
      allowNull: false
    },
    category: {
      type: DataTypes.ENUM('court_order', 'judgment', 'notice', 'warrant', 'injunction', 'other'),
      allowNull: false
    },
    caseNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    accessLevel: {
      type: DataTypes.ENUM('public', 'restricted', 'confidential'),
      defaultValue: 'restricted'
    },
    authorizedLawyers: {
      type: DataTypes.JSON,
      allowNull: true
    },
    validUntil: {
      type: DataTypes.DATE,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    downloadCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    timestamps: true
  });

  return JudgeDocument;
};

// models/DraftTemplate.js
module.exports = (sequelize, DataTypes) => {
  const DraftTemplate = sequelize.define('DraftTemplate', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    category: {
      type: DataTypes.ENUM('contract', 'petition', 'notice', 'agreement', 'application', 'letter', 'other'),
      allowNull: false
    },
    subcategory: {
      type: DataTypes.STRING,
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    templateContent: {
      type: DataTypes.TEXT('long'),
      allowNull: false
    },
    variables: {
      type: DataTypes.JSON,
      allowNull: true
    },
    tags: {
      type: DataTypes.JSON,
      allowNull: true
    },
    difficulty: {
      type: DataTypes.ENUM('beginner', 'intermediate', 'advanced'),
      defaultValue: 'beginner'
    },
    usageCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    rating: {
      type: DataTypes.FLOAT,
      defaultValue: 0.0
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    timestamps: true
  });

  return DraftTemplate;
};

// models/AdvocateDiary.js
module.exports = (sequelize, DataTypes) => {
  const AdvocateDiary = sequelize.define('AdvocateDiary', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    caseNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    clientName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    category: {
      type: DataTypes.ENUM('case', 'meeting', 'court_hearing', 'research', 'document_prep', 'other'),
      defaultValue: 'other'
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
      defaultValue: 'medium'
    },
    status: {
      type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'cancelled'),
      defaultValue: 'pending'
    },
    attachments: {
      type: DataTypes.JSON,
      allowNull: true
    },
    tags: {
      type: DataTypes.JSON,
      allowNull: true
    },
    reminderDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    isArchived: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    timestamps: true
  });

  return AdvocateDiary;
};

// models/CaseSchedule.js
module.exports = (sequelize, DataTypes) => {
  const CaseSchedule = sequelize.define('CaseSchedule', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    caseNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    court: {
      type: DataTypes.STRING,
      allowNull: true
    },
    judge: {
      type: DataTypes.STRING,
      allowNull: true
    },
    eventType: {
      type: DataTypes.ENUM('hearing', 'filing_deadline', 'meeting', 'reminder', 'other'),
      allowNull: false
    },
    scheduledDate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    reminderTime: {
      type: DataTypes.INTEGER,
      defaultValue: 30
    },
    isRecurring: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    recurrencePattern: {
      type: DataTypes.JSON,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('scheduled', 'completed', 'cancelled', 'postponed'),
      defaultValue: 'scheduled'
    },
    participants: {
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    timestamps: true
  });

  return CaseSchedule;
};

// models/DocumentTranslation.js
module.exports = (sequelize, DataTypes) => {
  const DocumentTranslation = sequelize.define('DocumentTranslation', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    documentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Documents',
        key: 'id'
      }
    },
    originalLanguage: {
      type: DataTypes.STRING,
      allowNull: false
    },
    targetLanguage: {
      type: DataTypes.STRING,
      allowNull: false
    },
    originalText: {
      type: DataTypes.TEXT('long'),
      allowNull: false
    },
    translatedText: {
      type: DataTypes.TEXT('long'),
      allowNull: false
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    provider: {
      type: DataTypes.ENUM('google', 'openai', 'custom'),
      defaultValue: 'google'
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed'),
      defaultValue: 'pending'
    }
  }, {
    timestamps: true
  });

  return DocumentTranslation;
};