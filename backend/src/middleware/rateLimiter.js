import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  message: { error: 'Too many attempts, try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});