const multer = require('multer');
const path = require('path');

const allowedExtensions = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const maxFileSizeBytes = Number(process.env.DOCUMENT_MAX_FILE_SIZE_BYTES || (10 * 1024 * 1024) - 1);
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const extension = path.extname((file.originalname || '').toLowerCase());

  // Primary validation by extension to support mobile MIME quirks.
  if (allowedExtensions.has(extension)) {
    return cb(null, true);
  }

  console.warn('[Upload Reject]', {
    mimetype: file.mimetype,
    originalname: file.originalname
  });
  return cb(new Error('Only PDF, JPG, and PNG files are allowed'));
};

const uploadTeacherDocument = multer({
  storage,
  limits: { fileSize: maxFileSizeBytes },
  fileFilter
});

module.exports = { uploadTeacherDocument };
