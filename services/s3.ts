
import { Readable } from 'stream'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from '../constants/env';


export const s3Client = new S3Client({
  region:env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

const getKeyFromS3Url = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    const key = parsed.pathname?.replace(/^\/+/, "");
    return key ? decodeURIComponent(key) : null;
  } catch {
    return null;
  }
};

export const getPresignedGetUrl = async (
  keyOrUrl: string,
  expiresInSeconds = 60 * 60,
): Promise<string> => {
  const key = keyOrUrl.startsWith("http") ? getKeyFromS3Url(keyOrUrl) : keyOrUrl;
  if (!key) return keyOrUrl;

  return await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
    { expiresIn: expiresInSeconds },
  );
};

export const uploadToS3 = async (fileBuffer: Buffer, key: string): Promise<string> => {
  const fileStream = Readable.from(fileBuffer);

  const params = {
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: fileStream,
    ContentLength: fileBuffer.length,
    ContentType: "application/pdf",
  };

  await s3Client.send(new PutObjectCommand(params));

  return key;
};
