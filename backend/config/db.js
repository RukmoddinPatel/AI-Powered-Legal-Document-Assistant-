// config/db.js - FIXED VERSION
const { Sequelize } = require('sequelize');
require('dotenv').config();

console.log('🔍 Database Configuration Check:');
console.log('DB_NAME:', process.env.DB_NAME || 'legal_assistant_db');
console.log('DB_USER:', process.env.DB_USER || 'root');
console.log('DB_HOST:', process.env.DB_HOST || 'localhost');
console.log('DB_PORT:', process.env.DB_PORT || 3306);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '***SET***' : '❌ NOT SET');

const sequelize = new Sequelize(
  process.env.DB_NAME || 'legal_assistant_db',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    // Add these options for better error handling
    retry: {
      match: [
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
        /ECONNRESET/,
        /ECONNREFUSED/,
        /ETIMEDOUT/,
        /ESOCKETTIMEDOUT/,
        /EHOSTUNREACH/,
        /EPIPE/,
        /EAI_AGAIN/,
        /SequelizeConnectionError/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeHostNotReachableError/,
        /SequelizeInvalidConnectionError/,
        /SequelizeConnectionTimedOutError/
      ],
      max: 3
    }
  }
);

// Test connection function
const testConnection = async () => {
  try {
    console.log('🔌 Testing database connection...');
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');
    
    // Test if we can run a simple query
    const [results] = await sequelize.query('SELECT 1 as test');
    console.log('✅ Database query test passed:', results[0]);
    
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    // More specific error messages
    if (error.name === 'SequelizeConnectionRefusedError') {
      console.error('💡 Solution: Make sure MySQL server is running');
    } else if (error.name === 'SequelizeAccessDeniedError') {
      console.error('💡 Solution: Check your database credentials (username/password)');
    } else if (error.name === 'SequelizeHostNotFoundError') {
      console.error('💡 Solution: Check your database host configuration');
    } else if (error.message.includes('Unknown database')) {
      console.error('💡 Solution: Create the database first or check DB_NAME');
    }
    
    throw error; // Re-throw to be handled by caller
  }
};

// Export both sequelize instance and test function
module.exports = sequelize;
module.exports.testConnection = testConnection;