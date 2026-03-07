const multer = require('multer');
const path = require('path');

const allowedMimeTypes = new Set([
  'application/pdf',
  'application/x-pdf',
  'image/jpeg',
  'image/png',
  'image/jpg'
]);

const allowedExtensions = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const genericMimeTypes = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

const maxFileSizeBytes = Number(process.env.DOCUMENT_MAX_FILE_SIZE_BYTES || 10 * 1024 * 1024);

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const mimeType = (file.mimetype || '').toLowerCase();
  const extension = path.extname((file.originalname || '').toLowerCase());

  // Accept known safe MIME types directly.
  if (allowedMimeTypes.has(mimeType)) {
    return cb(null, true);
  }

  // Mobile pickers sometimes send generic MIME; fallback to strict extension check.
  if (genericMimeTypes.has(mimeType) && allowedExtensions.has(extension)) {
    return cb(null, true);
  }

  return cb(new Error('Only PDF, JPG, and PNG files are allowed'));
};

const uploadTeacherDocument = multer({
  storage,
  limits: { fileSize: maxFileSizeBytes },
  fileFilter
});

module.exports = {
  uploadTeacherDocument
};
