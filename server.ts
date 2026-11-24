import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdminAuthService } from './src/server/adminAuth.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim() || null;
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const adminAuth = createAdminAuthService(process.env);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  // Admin Login API (server-side scrypt + constant-time verification)
  app.post('/api/admin/login', (req, res) => {
    const ipKey = req.ip || req.socket.remoteAddress || 'unknown';
    const rate = adminAuth.checkRateLimit(ipKey);
    if (!rate.allowed) {
      res.status(429).json({
        ok: false,
        error: `Terlalu banyak percobaan login admin. Coba lagi dalam ${rate.retryAfterSec ?? 60} detik.`,
      });
      return;
    }

    const body = req.body as { username?: unknown; password?: unknown } | undefined;
    if (!body || !adminAuth.verifyCredentials(body.username, body.password)) {
      res.status(401).json({
        ok: false,
        error: 'Username atau kata sandi admin tidak sesuai.',
      });
      return;
    }

    adminAuth.resetRateLimit(ipKey);
    const issued = adminAuth.issueToken(String(body.username));
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      token: issued.token,
      expiresAt: issued.expiresAt,
      admin: issued.admin,
    });
  });

  // Verify Active Admin Session
  app.get('/api/admin/session', (req, res) => {
    const token = extractBearerToken(req.headers.authorization);
    const result = adminAuth.verifyToken(token);
    res.setHeader('Cache-Control', 'no-store');
    if (!result.valid) {
      res.status(401).json({ ok: false, authenticated: false });
      return;
    }
    res.json({ ok: true, authenticated: true, admin: result.admin });
  });

  // Revoke Admin Session on Logout
  app.post('/api/admin/logout', (req, res) => {
    const token = extractBearerToken(req.headers.authorization);
    adminAuth.revokeToken(token);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true });
  });

  // Rotate Admin Password (Authenticated via Bearer token)
  app.post('/api/admin/change-password', (req, res) => {
    const token = extractBearerToken(req.headers.authorization);
    const body = req.body as { currentPassword?: unknown; newPassword?: unknown } | undefined;
    const outcome = adminAuth.changePassword(token, body?.currentPassword, body?.newPassword);
    res.setHeader('Cache-Control', 'no-store');
    if (!outcome.ok) {
      res.status(outcome.status).json({ ok: false, error: outcome.error });
      return;
    }
    res.json({ ok: true, token: outcome.token });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const hmrEnabled = process.env.DISABLE_HMR !== 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrEnabled ? { server: httpServer } : false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SBUM HRIS server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
