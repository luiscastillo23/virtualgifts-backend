// s3.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly logger = new Logger(S3Service.name);

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey:
          this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
      },
    });
    this.bucketName =
      this.configService.get<string>('AWS_S3_BUCKET_NAME') || '';
  }

  async uploadFileToS3(
    file: Express.Multer.File,
    key: string,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    try {
      await this.s3Client.send(command);
      // const url = await this.getPresignedUrl(key);
      return key;
    } catch (error) {
      throw new Error(`S3 Upload Failed: ${error.message}`);
    }
  }

  async getPresignedUrl(key: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: 3600 }); // 1-hour expiry
  }

  /**
   * Extract S3 key from a presigned URL
   * @param url - The presigned S3 URL
   * @returns The S3 key
   */
  extractKeyFromUrl(url: string): string {
    try {
      // Parse the URL to extract the pathname
      // const urlObj = new URL(url);
      // The pathname starts with a slash and includes the bucket name, so we need to remove those
      // const pathParts = urlObj.pathname.split('/');
      // Remove the first empty string and the bucket name
      // pathParts.splice(0, 2);
      // Join the remaining parts to get the key
      // return pathParts.join('/');

      // probando
      const urlNew = new URL(url);
      const pathname = urlNew.pathname;

      if (pathname) {
        // Elimina la barra inicial y el directorio 'projects/images/'
        const rutaRelativa = pathname.substring(1);
        return rutaRelativa;
      }

      return '';
    } catch (error) {
      this.logger.error(`Failed to extract key from URL: ${url}`, error.stack);
      return '';
    }
  }

  /**
   * Delete a file from S3
   * @param url - The S3 URL of the file to delete
   */
  async deleteFileFromS3(url: string): Promise<void> {
    try {
      const key = this.extractKeyFromUrl(url);

      if (!key) {
        this.logger.warn(`Could not extract key from URL: ${url}`);
        return;
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`Successfully deleted file from S3: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file from S3: ${url}`, error.stack);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Delete a file from S3 using its key.
   * @param key - The S3 object key of the file to delete
   */
  async deleteFileByKey(key: string): Promise<void> {
    // Changed parameter name and type expectation
    if (!key) {
      this.logger.warn(`deleteFileByKey called with empty key.`);
      return; // Don't proceed if the key is invalid
    }
    if (!this.bucketName) {
      this.logger.error(
        `Cannot delete file: AWS_S3_BUCKET_NAME is not configured.`,
      );
      throw new Error(`S3 Bucket name not configured`); // Fail fast
    }

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      this.logger.log(
        `Attempting to delete S3 object: Bucket=${this.bucketName}, Key=${key}`,
      );
      await this.s3Client.send(command);
      this.logger.log(`Successfully deleted file from S3: Key=${key}`);
    } catch (error) {
      // Log the specific error from AWS SDK
      this.logger.error(
        `Failed to delete file from S3: Key=${key}`,
        error.stack,
      );
      // Re-throw the error so the calling service knows deletion failed
      throw new Error(`Failed to delete file ${key} from S3: ${error.message}`);
    }
  }
}
