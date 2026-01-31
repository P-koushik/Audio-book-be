import fs from "node:fs/promises";
import path from "node:path";
import { credential, ServiceAccount } from "firebase-admin";
import { initializeApp } from "firebase-admin/app";
import { Auth, getAuth } from "firebase-admin/auth";

import { env } from "../constants/env";

let auth: Auth | null = null;
let initPromise: Promise<Auth | null> | null = null;

const loadServiceAccount = async (): Promise<ServiceAccount> => {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON !== "NA") {
    return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccount;
  }

  if (env.serviceAccountKeyPath === "NA") {
    throw new Error(
      'Firebase is not configured: set "serviceAccountKeyPath" or "FIREBASE_SERVICE_ACCOUNT_JSON".',
    );
  }

  const absolutePath = path.isAbsolute(env.serviceAccountKeyPath)
    ? env.serviceAccountKeyPath
    : path.resolve(process.cwd(), env.serviceAccountKeyPath);

  const json = await fs.readFile(absolutePath, "utf8");
  return JSON.parse(json) as ServiceAccount;
};

const initializeFirebase = async (): Promise<Auth | null> => {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON === "NA" && env.serviceAccountKeyPath === "NA") {
    console.log("Firebase not configured; skipping initialization.");
    return null;
  }

  console.log("Initializing Firebase");
  const serviceAccount = await loadServiceAccount();

  const firebaseApp = initializeApp({
    credential: credential.cert(serviceAccount),
  });

  return getAuth(firebaseApp);
};

const ensureInitialized = (): Promise<Auth | null> => {
  if (initPromise) return initPromise;
  initPromise = initializeFirebase()
    .then((initializedAuth) => {
      auth = initializedAuth;
      return auth;
    })
    .catch((error) => {
      console.error("Failed to initialize Firebase:", error);
      auth = null;
      return null;
    });
  return initPromise;
};

// Initialize eagerly so startup logs show configuration issues early.
void ensureInitialized();

export default (): Auth | null => auth;
