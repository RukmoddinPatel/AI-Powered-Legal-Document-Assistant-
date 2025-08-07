const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Document = sequelize.define('Document', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  originalFileName: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  fileName: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  filePath: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  fileType: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  fileSize: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  mimeType: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  documentType: {
    type: DataTypes.ENUM('contract', 'agreement', 'lease', 'will', 'court_document', 'other'),
    defaultValue: 'other'
  },
  status: {
    type: DataTypes.ENUM('uploaded', 'processing', 'processed', 'error'),
    defaultValue: 'uploaded'
  },
  originalText: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  simplifiedText: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  confidence: {
    type: DataTypes.DECIMAL(5, 4),
    allowNull: true
  },
  downloadCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'documents',
  indexes: [
    { fields: ['userId'] },
    { fields: ['status'] },
    { fields: ['documentType'] }
  ]
});

module.exports = Document;
