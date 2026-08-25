import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

if (!process.env.SUPABASE_STORAGE_BUCKET) {
  throw new Error('Missing SUPABASE_STORAGE_BUCKET env var. Check .env against .env.example.');
}
const BUCKET: string = process.env.SUPABASE_STORAGE_BUCKET;

export async function uploadFile(req: Request, res: Response) {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: '업로드할 파일(file 필드)이 필요합니다.' });
  }

  const objectPath = `${Date.now()}-${randomUUID()}-${file.originalname}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(objectPath, file.buffer, { contentType: file.mimetype });

  if (uploadError) {
    return res.status(500).json({ error: uploadError.message });
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath);

  return res.status(201).json({ url: data.publicUrl });
}
