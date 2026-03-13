import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { docClient } from '../services/dbClient';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import * as crypto from 'crypto';
import * as cookie from 'cookie';
import { sanitizeObject, withSecurityHeaders } from '../utils/security';

const isOffline = process.env.IS_OFFLINE !== 'false';
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET && !isOffline) {
    throw new Error('FATAL: JWT_SECRET environment variable is missing in production.');
}
const SECRET = JWT_SECRET || 'super-secret-local-key';

// Simple in-memory rate limiter for MVP (Lambda execution context)
// Ideal for AWS Free Tier without Redis, but state doesn't persist across cold starts. 
// A robust solution would use DynamoDB TTL or Redis.
const rateLimitCache = new Map<string, { count: number, resetAt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

const isRateLimited = (ip: string, email: string) => {
    const key = `${ip}:${email}`;
    const now = Date.now();
    const record = rateLimitCache.get(key);

    if (record) {
        if (now > record.resetAt) {
            rateLimitCache.delete(key);
            return false;
        }
        if (record.count >= MAX_ATTEMPTS) {
            return true;
        }
    }
    return false;
};

const incrementRateLimit = (ip: string, email: string) => {
    const key = `${ip}:${email}`;
    const now = Date.now();
    const record = rateLimitCache.get(key);

    if (record && now <= record.resetAt) {
        record.count++;
    } else {
        rateLimitCache.set(key, { count: 1, resetAt: now + LOCKOUT_MS });
    }
};

const clearRateLimit = (ip: string, email: string) => {
    const key = `${ip}:${email}`;
    rateLimitCache.delete(key);
}


export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
        const routeKey = `${event.requestContext.http.method} ${event.requestContext.http.path}`;

        if (routeKey === 'POST /api/auth/signup') {
            return await signup(event);
        } else if (routeKey === 'POST /api/auth/login') {
            return await login(event);
        } else if (routeKey === 'POST /api/auth/logout') {
            return await logout();
        } else if (routeKey === 'GET /api/auth/me') {
            return await me(event);
        }

        return withSecurityHeaders({
            statusCode: 404,
            body: JSON.stringify({ message: 'Not Found' }),
        });
    } catch (error) {
        console.error('Auth Error:', error);
        return withSecurityHeaders({
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal Server Error' }),
        });
    }
};

const signup = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    if (!event.body) return withSecurityHeaders({ statusCode: 400, body: 'Bad Request' });

    const { email, password } = sanitizeObject(JSON.parse(event.body));

    if (!email || !password) {
        return withSecurityHeaders({ statusCode: 400, body: JSON.stringify({ message: 'Email and password are required' }) });
    }

    // Strong Password Validation
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
        return withSecurityHeaders({
            statusCode: 400,
            body: JSON.stringify({ message: 'Password must be at least 8 characters long, contain at least one uppercase letter, one lowercase letter, one number and one special character' })
        });
    }

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    const getCmd = new GetCommand({
        TableName: 'Users',
        Key: { userId: email },
    });

    const existingUser = await docClient.send(getCmd);
    if (existingUser.Item) {
        return withSecurityHeaders({ statusCode: 400, body: JSON.stringify({ message: 'User already exists' }) });
    }

    const putCmd = new PutCommand({
        TableName: 'Users',
        Item: {
            userId: email,
            id: userId,
            passwordHash,
            createdAt: new Date().toISOString(),
        },
    });

    await docClient.send(putCmd);
    console.info(`[AUDIT] New user registered: ${email}`);

    const token = jwt.sign({ userId, email }, SECRET, { expiresIn: '24h' });
    const cookieHeader = cookie.serialize('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24, // 24 hours
        path: '/'
    });

    return withSecurityHeaders({
        statusCode: 201,
        headers: {
            'Set-Cookie': cookieHeader,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'User created successfully', user: { id: userId, email } }),
    });
};

const login = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    if (!event.body) return withSecurityHeaders({ statusCode: 400, body: 'Bad Request' });

    const { email, password } = sanitizeObject(JSON.parse(event.body));
    const ip = event.requestContext.http.sourceIp;

    if (!email || !password) {
        return withSecurityHeaders({ statusCode: 400, body: JSON.stringify({ message: 'Email and password are required' }) });
    }

    if (isRateLimited(ip, email)) {
        console.warn(`[SECURITY] Rate limit exceeded for IP ${ip} and email ${email}`);
        return withSecurityHeaders({ statusCode: 429, body: JSON.stringify({ message: 'Too many login attempts. Please try again later.' }) });
    }

    const getCmd = new GetCommand({
        TableName: 'Users',
        Key: { userId: email },
    });

    const response = await docClient.send(getCmd);
    const user = response.Item;

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        console.warn(`[AUDIT] Failed login attempt for email: ${email}`);
        incrementRateLimit(ip, email);
        return withSecurityHeaders({ statusCode: 401, body: JSON.stringify({ message: 'Invalid credentials' }) });
    }

    console.info(`[AUDIT] Successful login for user: ${user.id}`);
    clearRateLimit(ip, email);

    const token = jwt.sign({ userId: user.id, email }, SECRET, { expiresIn: '24h' });
    const cookieHeader = cookie.serialize('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24, // 24 hours
        path: '/'
    });

    return withSecurityHeaders({
        statusCode: 200,
        headers: {
            'Set-Cookie': cookieHeader,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'Login successful', user: { id: user.id, email } }),
    });
};

const logout = async (): Promise<APIGatewayProxyStructuredResultV2> => {
    const cookieHeader = cookie.serialize('token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        expires: new Date(0), // expire immediately
        path: '/'
    });

    return withSecurityHeaders({
        statusCode: 200,
        headers: {
            'Set-Cookie': cookieHeader,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'Logged out successfully' })
    });
}

const me = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const cookiesStr = event.headers?.cookie || '';
    const cookies = cookie.parse(cookiesStr);
    const token = cookies.token;

    if (!token) {
        return withSecurityHeaders({ statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) });
    }

    try {
        const payload = jwt.verify(token, SECRET) as any;
        return withSecurityHeaders({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: { id: payload.userId, email: payload.email } })
        });
    } catch (error) {
        return withSecurityHeaders({ statusCode: 401, body: JSON.stringify({ message: 'Invalid token' }) });
    }
}
