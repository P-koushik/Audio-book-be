import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function presignFromS3Url(
  s3Url: string,
  expiresInSeconds: number = 900
): Promise<string> {
  const url = new URL(s3Url);

  const bucket = url.hostname.split(".")[0];
  const key = decodeURIComponent(url.pathname.slice(1));

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentType: "application/pdf",
  });

  return await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}