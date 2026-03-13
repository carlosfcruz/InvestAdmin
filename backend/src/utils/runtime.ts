export function isOfflineRuntime(): boolean {
  return process.env.IS_OFFLINE === "true";
}

export function getJwtSecret(): string {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.JEST_WORKER_ID) {
    return "test-only-jwt-secret";
  }

  throw new Error("FATAL: JWT_SECRET environment variable is missing.");
}

export function getDynamoClientProps() {
  const dynamoEndpoint = process.env.DYNAMODB_ENDPOINT;

  if (dynamoEndpoint) {
    return {
      region: "localhost",
      endpoint: dynamoEndpoint,
      credentials: {
        accessKeyId: "MockAccessKeyId",
        secretAccessKey: "MockSecretAccessKey",
      },
    };
  }

  return {
    region: process.env.AWS_REGION || "us-east-1",
  };
}
