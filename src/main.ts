import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common'; // Import Logger and ValidationPipe
// import helmet from 'helmet';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // --- Security ---
  // Apply basic security headers using Helmet
  // app.use(helmet());

  // --- Configuration ---
  // Get ConfigService instance to access environment variables
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 4000;
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // --- API Prefix ---
  // Set a global prefix for all routes (e.g., /api/v1/users)
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // --- CORS ---
  // Enable Cross-Origin Resource Sharing
  // For production, configure specific origins, methods, and headers
  // Example:
  // app.enableCors({
  //   origin: configService.get<string>('CLIENT_URL') || 'http://localhost:3000', // Allow frontend origin
  //   methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  //   credentials: true,
  // });
  // For simplicity during development or if open access is intended:
  app.enableCors();

  // --- Validation ---
  // Enable global validation pipe to automatically transform and validate incoming data based on DTOs
  /*  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that do not have any decorators
      forbidNonWhitelisted: true, // Allow extra fields (fixes 400 error with FormData)
      transform: true, // Automatically transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Allow implicit type conversion based on TS type
      },
    }),
  );  */

  // --- Swagger (OpenAPI) Setup ---
  // Only setup Swagger in development environment for security and performance reasons
  if (nodeEnv === 'development') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('VirtualGifts API') // Title of the API documentation
      .setDescription('API documentation for the VirtualGifts application') // Description
      .setVersion('1.0') // Version of the API
      // .addTag('auth', 'Authentication related endpoints') // Example tag
      // .addTag('users', 'User management endpoints') // Example tag
      .addBearerAuth() // Add support for Bearer token authentication
      .build(); // Build the configuration object

    // Create the Swagger document using the app instance and the config
    const document = SwaggerModule.createDocument(app, swaggerConfig);

    // Setup the Swagger UI endpoint
    // The first argument is the path for the Swagger UI (e.g., http://localhost:4000/docs)
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true, // Persist authorization data in Swagger UI
      },
      customSiteTitle: 'VirtualGifts API Docs', // Custom title for the Swagger UI page
    });
    const logger = new Logger('Swagger'); // Use specific logger context
    logger.log(`📄 Swagger UI available at http://localhost:${port}/docs`);
  }

  // --- Graceful Shutdown ---
  // Enable shutdown hooks to gracefully close connections (database, etc.) on termination signals
  app.enableShutdownHooks();

  // --- Start Application ---
  await app.listen(port);

  // --- Logging ---
  // Use NestJS Logger for application startup message
  const logger = new Logger('Bootstrap');
  logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
  logger.log(
    `🌱 Environment: ${configService.get<string>('NODE_ENV', 'development')}`,
  );
  // await app.listen(process.env.PORT ?? 4000);
}
bootstrap().catch((err) => {
  // Use Logger for bootstrap errors as well
  const logger = new Logger('BootstrapError');
  logger.error('❌ Error during application bootstrap', err.stack);
  process.exit(1); // Exit process on critical bootstrap failure
});

// old
/*

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();


import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

*/
