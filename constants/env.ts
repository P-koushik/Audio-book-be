import dotenv from "dotenv";

dotenv.config();

type TEnv = {
    MONGO_URL: string | "NA";
    PORT: number;
    serviceAccountKeyPath: string | "NA";
};

export const env: TEnv = {
    MONGO_URL: process.env.MONGO_URL || "NA",
    PORT: Number(process.env.PORT) || 5000,
    serviceAccountKeyPath: process.env.serviceAccountKeyPath || "NA",
};
