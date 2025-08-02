const express = require('express');
const { register, login, logout, getProfile, updateProfile } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware'); // Use your existing middleware

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.use(protect); // Apply authentication to all routes below
router.post('/logout', logout);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);

// Verify token endpoint
router.post('/verify', (req, res) => {
  res.status(200).json({ 
    success: true,
    message: 'Token verified successfully',
    user: req.user.toJSON()
  });
});

module.exports = router;