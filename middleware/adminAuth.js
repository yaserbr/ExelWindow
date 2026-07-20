const crypto = require('crypto');

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

function isSameSecret(input, expected) {
  const inputHash = hashValue(input);
  const expectedHash = hashValue(expected);
  return crypto.timingSafeEqual(inputHash, expectedHash);
}

function adminAuth(req, res, next) {
  const configuredPassword = process.env.ADMIN_PASSWORD;

  if (!configuredPassword) {
    return res.status(500).json({
      message: 'لم يتم إعداد كلمة مرور الأدمن على السيرفر.'
    });
  }

  const providedPassword = req.get('x-admin-password') || req.body?.password;

  if (!providedPassword || !isSameSecret(providedPassword, configuredPassword)) {
    return res.status(401).json({
      message: 'كلمة مرور الأدمن غير صحيحة.'
    });
  }

  return next();
}

module.exports = adminAuth;
