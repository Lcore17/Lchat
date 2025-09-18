const Joi = require('joi');

const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        message: 'Validation error', 
        details: error.details[0].message 
      });
    }
    next();
  };
};

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
  nickname: Joi.string().max(50).optional()
});

const loginSchema = Joi.object({
  login: Joi.string().required(), // Can be email or username
  password: Joi.string().required()
});

const updateProfileSchema = Joi.object({
  nickname: Joi.string().max(50).optional(),
  bio: Joi.string().max(160).optional(),
  preferences: Joi.object({
    theme: Joi.string().valid('light', 'dark', 'system').optional(),
    defaultTranslateLanguage: Joi.string().valid('en', 'mr', 'te', 'ta','hi').optional(),
    autoTranslate: Joi.boolean().optional(),
    notifications: Joi.object({
      messages: Joi.boolean().optional(),
      friendRequests: Joi.boolean().optional(),
      mentions: Joi.boolean().optional()
    }).optional()
  }).optional()
});

const friendRequestSchema = Joi.object({
  toUserId: Joi.string().required(),
  message: Joi.string().max(200).optional()
});

const translateSchema = Joi.object({
  text: Joi.string().max(4000).required(),
  targetLanguage: Joi.string().valid('en', 'mr', 'te', 'ta','hi').required(),
  enablePreprocessing: Joi.boolean().default(true)
});

module.exports = {
  validateRequest,
  registerSchema,
  loginSchema,
  updateProfileSchema,
  friendRequestSchema,
  translateSchema
};