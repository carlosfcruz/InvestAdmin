import { describe, expect, it } from 'vitest';
import { normalizeApiBaseUrl } from './api';

describe('normalizeApiBaseUrl', () => {
    it('uses a relative API path by default', () => {
        expect(normalizeApiBaseUrl()).toBe('/api');
        expect(normalizeApiBaseUrl('')).toBe('/api');
        expect(normalizeApiBaseUrl('   ')).toBe('/api');
    });

    it('normalizes a configured absolute API URL', () => {
        expect(normalizeApiBaseUrl('http://127.0.0.1:4000/api/')).toBe('http://127.0.0.1:4000/api');
    });
});
