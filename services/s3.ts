
import { Readable } from 'stream'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { env } from '../constants/env';


export const s3Client = new S3Client({
  region:env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

export const uploadToS3 = async (fileBuffer: Buffer, key: string): Promise<string> => {
  const fileStream = Readable.from(fileBuffer);

  const params = {
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: fileStream,
    ContentLength: fileBuffer.length,
  };

  await s3Client.send(new PutObjectCommand(params));

  return `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
};

