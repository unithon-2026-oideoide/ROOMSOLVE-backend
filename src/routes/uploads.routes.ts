import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/asyncHandler';
import { uploadFile } from '../controllers/uploads.controller';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('jpg, jpeg, png, webp 형식의 이미지만 업로드할 수 있습니다.'));
    }
    cb(null, true);
  },
});

const router = Router();

router.post(
  '/',
  (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : '파일 업로드에 실패했습니다.';
        return res.status(400).json({ error: message });
      }
      next();
    });
  },
  asyncHandler(uploadFile)
);

export default router;
