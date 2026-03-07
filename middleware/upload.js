const multer = require('multer');

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png'
]);

const maxFileSizeBytes = Number(process.env.DOCUMENT_MAX_FILE_SIZE_BYTES || 10 * 1024 * 1024);

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    return cb(new Error('Only PDF, JPG, and PNG files are allowed'));
  }
  return cb(null, true);
};

const uploadTeacherDocument = multer({
  storage,
  limits: { fileSize: maxFileSizeBytes },
  fileFilter
});

module.exports = {
  uploadTeacherDocument
};
