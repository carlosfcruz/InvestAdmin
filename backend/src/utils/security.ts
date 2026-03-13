import sanitizeHtml from 'sanitize-html';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

/**
 * Sanitiza recursivamente objetos, arrays ou strings, 
 * escapando tags HTML e scripts maliciosos.
 */
export function sanitizeObject<T>(obj: T): T {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (typeof obj === 'string') {
        // Opções rigorosas restritivas para evitar injeção
        return sanitizeHtml(obj, {
            allowedTags: [], // Nenhuma tag HTML permitida
            allowedAttributes: {}
        }) as unknown as T;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item)) as unknown as T;
    }

    if (typeof obj === 'object') {
        const sanitizedObj: any = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitizedObj[key] = sanitizeObject(value);
        }
        return sanitizedObj as T;
    }

    // Number, boolean, etc.
    return obj;
}

/**
 * Injeta cabeçalhos de segurança (HSTS, CSP, X-Frame-Options)
 * na resposta padrão do API Gateway.
 */
export function withSecurityHeaders(response: APIGatewayProxyStructuredResultV2): APIGatewayProxyStructuredResultV2 {
    const securityHeaders = {
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'",
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
    };

    return {
        ...response,
        headers: {
            ...securityHeaders,
            ...response.headers, // headers da aplicação podem sobrescrever se necessário
        }
    };
}
