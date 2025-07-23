import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { S3Service } from 'src/common/services/aws-s3.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, S3Service],
})
export class CategoriesModule {}
