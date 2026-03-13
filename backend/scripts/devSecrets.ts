import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const backendRoot = path.resolve(__dirname, "..");
const seedPasswordFile = path.join(backendRoot, ".dev-seed-password");

function writeSecret(secretPath: string, value: string) {
  fs.writeFileSync(secretPath, `${value}\n`, "utf8");
}

function readSecret(secretPath: string) {
  if (!fs.existsSync(secretPath)) {
    return null;
  }

  const value = fs.readFileSync(secretPath, "utf8").trim();
  return value || null;
}

function generateSeedPassword() {
  return `Inv${crypto.randomBytes(8).toString("hex")}!9`;
}

export function getOrCreateSeedPassword() {
  const envPassword = process.env.DEV_SEED_PASSWORD?.trim();
  if (envPassword) {
    return envPassword;
  }

  const filePassword = readSecret(seedPasswordFile);
  if (filePassword) {
    return filePassword;
  }

  const generatedPassword = generateSeedPassword();
  writeSecret(seedPasswordFile, generatedPassword);
  console.log(`[dev] Generated local seed password at ${seedPasswordFile}`);
  return generatedPassword;
}

export function requireSeedPassword() {
  const password = process.env.DEV_SEED_PASSWORD?.trim() || readSecret(seedPasswordFile);
  if (password) {
    return password;
  }

  throw new Error("DEV_SEED_PASSWORD is missing. Run the local launcher or seed the database first.");
}
