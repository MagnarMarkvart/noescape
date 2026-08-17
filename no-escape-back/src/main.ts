import 'dotenv/config';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { existsSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useBodyParser('json', { limit: '8mb' });
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  app.useStaticAssets(
    join(process.cwd(), '..', 'NoEscape-UI', 'public', 'assets'),
    { prefix: '/assets/' },
  );

  // Angular SPA dist
  const distPath = join(process.cwd(), '..', 'NoEscape-UI', 'dist', 'NoEscape-UI', 'browser');
  if (existsSync(distPath)) {
    app.useStaticAssets(distPath);
    // SPA fallback — check raw Accept header because */* in browsers matches everything
    app.use((req: any, res: any, next: any) => {
      if (req.method === 'GET' && !req.path.includes('.')) {
        const accept: string = req.headers['accept'] || '';
        // Browser navigation: Accept includes text/html
        // API call (Angular HttpClient): Accept includes application/json
        if (accept.includes('text/html') && !accept.includes('application/json')) {
          res.sendFile(join(distPath, 'index.html'));
          return;
        }
      }
      next();
    });
  }

  // /status → 301 redirect to /dashboard
  app.use((req: any, res: any, next: any) => {
    if (req.path === '/status' || req.path === '/status/') {
      res.redirect(301, '/dashboard');
      return;
    }
    next();
  });

  app.enableCors({
    origin: [
      'http://localhost:4200',
      'http://127.0.0.1:4200',
    ],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
