import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { CategoriesModule } from './categories/categories.module';
import { SubcategoriesModule } from './subcategories/subcategories.module';

@Module({
  imports: [PrismaModule, MailModule, CategoriesModule, SubcategoriesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
