import express from "express";
import type { Request, Response } from "express";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler as investmentsHandler } from "./handlers/investmentsHandler";
import { handler as indexesHandler } from "./handlers/indexesHandler";
import { handler as updateIndexesHandler } from "./handlers/updateEconomicIndexesHandler";
import { handler as authHandler } from "./handlers/authHandler";
import cors from "cors";

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

function toApiGatewayEvent(req: Request): any {
  // Extract body: express.json() already parsed it if content-type was application/json.
  // Lambda expects it as a string.
  let body: string | null = null;
  if (req.body) {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    // If it's an empty object, some lambda handlers might expect null
    if (body === '{}' && req.method === 'GET') body = null;
  }

  console.log(`[local-dev] Request: ${req.method} ${req.path}, Body size: ${body ? body.length : 0}`);

  return {
    body,
    headers: req.headers,
    requestContext: {
      http: {
        method: req.method,
        path: req.path,
        sourceIp: req.ip || req.socket.remoteAddress || '127.0.0.1'
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

  // Express map custom headers
  Object.keys(headers).forEach((key) => {
    res.setHeader(key, headers[key] as string | number | readonly string[]);
  });

  if (result.cookies) {
    result.cookies.forEach(c => res.setHeader('Set-Cookie', c));
  }

  res.status(statusCode).send(body);
}

