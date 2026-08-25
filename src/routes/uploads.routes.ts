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

/**
 * @swagger
 * /api/uploads:
 *   post:
 *     summary: 사진 업로드 (Supabase Storage)
 *     description: 이미지를 Supabase Storage에 업로드하고 public URL을 반환. 프론트는 여기서 받은 url을 POST /api/reports의 photo_url에 넣어서 보내면 됨.
 *     tags: [Uploads]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: jpg, jpeg, png, webp만 허용, 최대 10MB
 *     responses:
 *       201:
 *         description: 업로드 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   format: uri
 *                   example: https://xxxx.supabase.co/storage/v1/object/public/report-photos/171234-uuid-photo.jpg
 *       400:
 *         description: 파일 누락, 허용되지 않는 형식, 또는 10MB 초과
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Storage 업로드 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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
