import dotenv from "dotenv";

dotenv.config();

type TEnv = {
  MONGO_URL: string | "NA";
  PORT: number;
  serviceAccountKeyPath: string | "NA";
  FIREBASE_SERVICE_ACCOUNT_JSON: string | "NA";
  AWS_ACCESS_KEY_ID: string | "NA";
  AWS_SECRET_ACCESS_KEY: string | "NA";
  AWS_REGION: string | "NA";
  S3_BUCKET: string | "NA";
  CONVERT_API: string | "NA"
};

const getEnv = (key: string, fallback: string = "NA"): string => {
  const value = process.env[key];
  if (value === undefined || value === null || value.trim() === "") return fallback;
  return value;
};

export const env: TEnv = {
  MONGO_URL: getEnv("MONGO_URL"),
  PORT: Number(getEnv("PORT", "5000")) || 5000,
  serviceAccountKeyPath: getEnv("serviceAccountKeyPath", getEnv("SERVICE_ACCOUNT_KEY_PATH")),
  FIREBASE_SERVICE_ACCOUNT_JSON: getEnv(
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    getEnv("serviceAccountKeyJson", "NA"),
  ),
  AWS_ACCESS_KEY_ID: getEnv("AWS_ACCESS_KEY_ID"),
  AWS_SECRET_ACCESS_KEY: getEnv("AWS_SECRET_ACCESS_KEY"),
  AWS_REGION: getEnv("AWS_REGION"),
  S3_BUCKET: getEnv("S3_BUCKET"),
  CONVERT_API: getEnv("CONVERT_API")
};
