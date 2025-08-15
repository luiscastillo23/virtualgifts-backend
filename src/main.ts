// src/main.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // --- START OF FIX ---
  // Explicitly use body-parser middleware. This is the key to resolving the
  // "stream is not readable" error by ensuring the JSON body parser is
  // correctly configured and placed in the middleware chain, especially
  // when complex module dependencies have disrupted the default setup.
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
  // --- END OF FIX ---

  // Enable CORS for frontend communication
  app.enableCors({
    origin: '*', // For production, you should restrict this to your frontend's domain
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Use global pipes for automatic request validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Setup Swagger for API documentation
  const config = new DocumentBuilder()
    .setTitle('Virtual Gifts API')
    .setDescription(
      'API documentation for the Virtual Gifts backend application',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Start the application
  const port = process.env.APP_PORT || 4000;
  await app.listen(port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
