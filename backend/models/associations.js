// This file handles all model associations to avoid circular imports
const User = require('./User');
const Document = require('./Document');

// Define associations after both models are loaded
User.hasMany(Document, {
  foreignKey: 'userId',
  as: 'documents',
  onDelete: 'CASCADE'
});

Document.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

module.exports = {
  User,
  Document
};