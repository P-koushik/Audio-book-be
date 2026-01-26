import dotenv from "dotenv";

dotenv.config();

type TEnv = {
    MONGO_URL: string | "NA";
    PORT: number;
    serviceAccountKeyPath: string | "NA";
    AWS_ACCESS_KEY_ID: string | "NA"
    AWS_SECRET_ACCESS_KEY: string | "NA"
    AWS_REGION: string | "NA"
    S3_BUCKET: string | "NA"
};

export const env: TEnv = {
    MONGO_URL: process.env.MONGO_URL || "NA",
    PORT: Number(process.env.PORT) || 5000,
    serviceAccountKeyPath: process.env.serviceAccountKeyPath || "NA",
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "NA",
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "NA",
    AWS_REGION: process.env.AWS_REGION || "NA",
    S3_BUCKET: process.env.S3_BUCKET || "NA"
};
