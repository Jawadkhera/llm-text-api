import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { testConfig } from './helpers.js';

describe('GET /health', () => {
  it('returns ok without authentication', async () => {
    const res = await request(createApp(testConfig())).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('GET /', () => {
  it('describes the service without authentication', async () => {
    const res = await request(createApp(testConfig())).get('/');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'llm-text-api', status: 'ok' });
    expect(res.body.endpoints).toContain('POST /api/generate');
  });
});
