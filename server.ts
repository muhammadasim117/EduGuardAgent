/**
 * EduGuard Agent - local development / self-hosted entry point.
 * On Vercel, api/index.ts is used directly as the serverless function.
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './api/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EduGuard Agent server online at http://0.0.0.0:${PORT}`);
  });
}

startServer();
