import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import type { Request, Response } from "express";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import cors from "cors";

function ensureLocalSecret(fileName: string) {
  const backendRoot = path.resolve(__dirname, "..");
  const secretPath = path.join(backendRoot, fileName);

  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, "utf8").trim();
  }

  const generatedSecret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(secretPath, `${generatedSecret}\n`, "utf8");
  return generatedSecret;
}

process.env.IS_OFFLINE = "true";
process.env.DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || "http://localhost:8000";
process.env.JWT_SECRET = process.env.JWT_SECRET || ensureLocalSecret(".dev-jwt-secret");

async function bootstrap() {
  const [{ handler: investmentsHandler }, { handler: indexesHandler }, { handler: updateIndexesHandler }, { handler: authHandler }] = await Promise.all([
    import("./handlers/investmentsHandler"),
    import("./handlers/indexesHandler"),
    import("./handlers/updateEconomicIndexesHandler"),
    import("./handlers/authHandler"),
  ]);

  const app = express();

  function isAllowedLocalOrigin(origin?: string | null): boolean {
    if (!origin) {
      return true;
    }

    try {
      const url = new URL(origin);
      if (url.protocol !== "http:" || url.port !== "5173") {
        return false;
      }

      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
        return true;
      }

      if (/^10\.\d+\.\d+\.\d+$/.test(url.hostname)) {
        return true;
      }

      if (/^192\.168\.\d+\.\d+$/.test(url.hostname)) {
        return true;
      }

      if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(url.hostname)) {
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  app.use(cors({
    origin: (origin, callback) => {
      if (isAllowedLocalOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin ${origin}`));
    },
    credentials: true,
  }));
  app.use(express.json());

  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    const result = await authHandler(toApiGatewayEvent(req));
    sendLambdaResult(result, res);
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const result = await authHandler(toApiGatewayEvent(req));
    sendLambdaResult(result, res);
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    const result = await authHandler(toApiGatewayEvent(req));
    sendLambdaResult(result, res);
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    const result = await authHandler(toApiGatewayEvent(req));
    sendLambdaResult(result, res);
  });

  app.get("/api/investments", async (req: Request, res: Response) => {
    const result = await investmentsHandler(toApiGatewayEvent(req));
    sendLambdaResult(result, res);
  });

  app.get("/api/investments/summary", async (req: Request, res: Response) => {
    const result = await investmentsHandler(toApiGatewayEvent(req));
    sendLambdaResult(result, res);
  });

  app.get("/api/investments/opportunities", async (req: Request, res: Response) => {
    const result = await investmentsHandler(toApiGatewayEvent(req));
    sendLambdaResult(result, res);
  });

  app.get("/api/investments/evolution", async (req: Request, res: Response) => {
    const result = await investmentsHandler(toApiGatewayEvent(req));
    sendLambdaResult(result, res);
  });

  app.get("/api/investments/:id", async (req: Request, res: Response) => {
    const result = await investmentsHandler(toApiGatewayEvent(req));
    sendLambdaResult(result, res);
  });

  app.get("/api/investments/:id/evolution", async (req: Request, res: Response) => {
    const result = await investmentsHandler(toApiGatewayEvent(req));
    sendLambdaResult(result, res);
  });

  app.post("/api/investments", async (req: Request, res: Response) => {
    const result = await investmentsHandler(toApiGatewayEvent(req));
    sendLambdaResult(result, res);
  });

  app.post("/api/investments/redeem", async (req: Request, res: Response) => {
    const result = await investmentsHandler(toApiGatewayEvent(req));
    sendLambdaResult(result, res);
  });

  app.put("/api/investments/:id", async (req: Request, res: Response) => {
    const result = await investmentsHandler(toApiGatewayEvent(req));
    sendLambdaResult(result, res);
  });

  app.delete("/api/investments/:id", async (req: Request, res: Response) => {
    const result = await investmentsHandler(toApiGatewayEvent(req));
    sendLambdaResult(result, res);
  });

  app.get("/api/indexes", async (req: Request, res: Response) => {
    const result = await indexesHandler(toApiGatewayEvent(req));
    sendLambdaResult(result, res);
  });

  app.post("/api/indexes/update", async (req: Request, res: Response) => {
    const result = await updateIndexesHandler(toApiGatewayEvent(req));
    sendLambdaResult(result, res);
  });

  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(`Local backend running at http://localhost:${port}`);
  });
}

function toApiGatewayEvent(req: Request): any {
  let body: string | null = null;
  if (req.body) {
    body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (body === "{}" && req.method === "GET") {
      body = null;
    }
  }

  console.log(`[local-dev] Request: ${req.method} ${req.path}, Body size: ${body ? body.length : 0}`);

  return {
    body,
    headers: req.headers,
    requestContext: {
      http: {
        method: req.method,
        path: req.path,
        sourceIp: req.ip || req.socket.remoteAddress || "127.0.0.1",
      },
    },
    pathParameters: req.params,
    queryStringParameters: req.query,
  };
}

function sendLambdaResult(result: APIGatewayProxyStructuredResultV2, res: Response): void {
  const statusCode = result.statusCode ?? 200;
  const headers = result.headers ?? {};
  const body = result.body ?? "";

  Object.keys(headers).forEach((key) => {
    res.setHeader(key, headers[key] as string | number | readonly string[]);
  });

  if (result.cookies) {
    result.cookies.forEach((cookieValue) => res.setHeader("Set-Cookie", cookieValue));
  }

  res.status(statusCode).send(body);
}

bootstrap().catch((error) => {
  console.error("[local-dev] Failed to start local backend", error);
  process.exitCode = 1;
});
