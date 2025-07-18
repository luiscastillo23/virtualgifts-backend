import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

export interface S3UploadResult {
  key: string;
  location: string;
  etag?: string;
  bucket: string;
}

export interface S3DeleteResult {
  successful: string[];
  failed: { key: string; error: string }[];
}

export interface S3FileInfo {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
  contentType?: string;
}

@Injectable()
export class S3Service {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;
  private readonly logger = new Logger(S3Service.name);

  constructor(private configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    this.bucketName =
      this.configService.get<string>('AWS_S3_BUCKET_NAME') || '';

    if (!this.bucketName) {
      this.logger.error('AWS_S3_BUCKET_NAME is not configured');
      throw new Error('AWS S3 bucket name is required');
    }

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey:
          this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
      },
    });

    this.logger.log(
      `S3Service initialized with bucket: ${this.bucketName}, region: ${this.region}`,
    );
  }

  /**
   * Upload a single file to S3
   * @param file - The file to upload (Express.Multer.File)
   * @param key - The S3 key (path) for the file
   * @param options - Additional upload options
   * @returns Promise<S3UploadResult>
   */
  async uploadFile(
    file: Express.Multer.File,
    key?: string,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
      cacheControl?: string;
      contentDisposition?: string;
    },
  ): Promise<S3UploadResult> {
    try {
      // Generate key if not provided
      const fileKey = key || this.generateFileKey(file.originalname);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        Body: file.buffer,
        ContentType:
          options?.contentType || file.mimetype || 'application/octet-stream',
        Metadata: options?.metadata,
        CacheControl: options?.cacheControl,
        ContentDisposition: options?.contentDisposition,
      });

      this.logger.log(`Uploading file to S3: ${fileKey}`);
      const response = await this.s3Client.send(command);

      const result: S3UploadResult = {
        key: fileKey,
        location: `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${fileKey}`,
        etag: response.ETag,
        bucket: this.bucketName,
      };

      this.logger.log(`Successfully uploaded file: ${fileKey}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`, error.stack);
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * Upload multiple files to S3 concurrently
   * @param files - Array of files to upload
   * @param keyPrefix - Optional prefix for all file keys
   * @param options - Upload options applied to all files
   * @returns Promise<S3UploadResult[]>
   */
  async uploadMultipleFiles(
    files: Express.Multer.File[],
    keyPrefix?: string,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
      cacheControl?: string;
      contentDisposition?: string;
    },
  ): Promise<S3UploadResult[]> {
    if (!files || files.length === 0) {
      this.logger.warn('uploadMultipleFiles called with empty files array');
      return [];
    }

    try {
      this.logger.log(`Starting upload of ${files.length} files`);

      const uploadPromises = files.map((file, index) => {
        const key = keyPrefix
          ? `${keyPrefix}/${this.generateFileKey(file.originalname)}`
          : this.generateFileKey(file.originalname);

        return this.uploadFile(file, key, options);
      });

      const results = await Promise.all(uploadPromises);
      this.logger.log(`Successfully uploaded ${results.length} files`);
      return results;
    } catch (error) {
      this.logger.error(
        `Failed to upload multiple files: ${error.message}`,
        error.stack,
      );
      throw new Error(`Multiple file upload failed: ${error.message}`);
    }
  }

  /**
   * Read/Download a file from S3
   * @param key - The S3 key of the file to read
   * @returns Promise<Buffer> - The file content as a Buffer
   */
  async readFile(key: string): Promise<Buffer> {
    try {
      this.logger.log(`Reading file from S3: ${key}`);

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new Error('File content is empty or undefined');
      }

      // Convert the stream to buffer
      const chunks: Uint8Array[] = [];
      const stream = response.Body as any;

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);
      this.logger.log(
        `Successfully read file: ${key} (${buffer.length} bytes)`,
      );
      return buffer;
    } catch (error) {
      this.logger.error(`Failed to read file from S3: ${key}`, error.stack);
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Get file information without downloading the content
   * @param key - The S3 key of the file
   * @returns Promise<S3FileInfo>
   */
  async getFileInfo(key: string): Promise<S3FileInfo> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      return {
        key,
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        etag: response.ETag || '',
        contentType: response.ContentType,
      };
    } catch (error) {
      this.logger.error(`Failed to get file info: ${key}`, error.stack);
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }

  /**
   * Delete a single file from S3
   * @param key - The S3 key of the file to delete
   * @returns Promise<void>
   */
  async deleteFile(key: string): Promise<void> {
    try {
      this.logger.log(`Deleting file from S3: ${key}`);

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`Successfully deleted file: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file from S3: ${key}`, error.stack);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Delete multiple files from S3 efficiently using batch operations
   * @param keys - Array of S3 keys to delete
   * @returns Promise<S3DeleteResult>
   */
  async deleteMultipleFiles(keys: string[]): Promise<S3DeleteResult> {
    if (!keys || keys.length === 0) {
      this.logger.warn('deleteMultipleFiles called with empty keys array');
      return { successful: [], failed: [] };
    }

    const successful: string[] = [];
    const failed: { key: string; error: string }[] = [];

    // AWS S3 DeleteObjects can handle up to 1000 objects per request
    const batchSize = 1000;

    try {
      this.logger.log(`Starting deletion of ${keys.length} files`);

      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);

        const command = new DeleteObjectsCommand({
          Bucket: this.bucketName,
          Delete: {
            Objects: batch.map((key) => ({ Key: key })),
            Quiet: false, // Return information about both successful and failed deletions
          },
        });

        try {
          const response = await this.s3Client.send(command);

          // Process successful deletions
          if (response.Deleted) {
            response.Deleted.forEach((deleted) => {
              if (deleted.Key) {
                successful.push(deleted.Key);
              }
            });
          }

          // Process failed deletions
          if (response.Errors) {
            response.Errors.forEach((error) => {
              if (error.Key) {
                failed.push({
                  key: error.Key,
                  error: error.Message || 'Unknown error',
                });
              }
            });
          }
        } catch (batchError) {
          // If entire batch fails, mark all keys in this batch as failed
          batch.forEach((key) => {
            failed.push({
              key,
              error: batchError.message || 'Batch deletion failed',
            });
          });

          this.logger.error(
            `Batch deletion failed for keys: ${batch.join(', ')}`,
            batchError.stack,
          );
        }
      }

      this.logger.log(
        `Deletion completed: ${successful.length} successful, ${failed.length} failed`,
      );
      return { successful, failed };
    } catch (error) {
      this.logger.error(`Failed to delete multiple files`, error.stack);
      throw new Error(`Multiple file deletion failed: ${error.message}`);
    }
  }

  /**
   * Generate a presigned URL for downloading a file
   * @param key - The S3 key of the file
   * @param expiresIn - URL expiration time in seconds (default: 3600 = 1 hour)
   * @returns Promise<string> - The presigned URL
   */
  async getPresignedDownloadUrl(
    key: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      this.logger.log(`Generated presigned download URL for: ${key}`);
      return url;
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned URL for: ${key}`,
        error.stack,
      );
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  /**
   * Generate a presigned URL for uploading a file
   * @param key - The S3 key where the file will be uploaded
   * @param contentType - The content type of the file
   * @param expiresIn - URL expiration time in seconds (default: 3600 = 1 hour)
   * @returns Promise<string> - The presigned URL
   */
  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      this.logger.log(`Generated presigned upload URL for: ${key}`);
      return url;
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned upload URL for: ${key}`,
        error.stack,
      );
      throw new Error(
        `Failed to generate presigned upload URL: ${error.message}`,
      );
    }
  }

  /**
   * Check if a file exists in S3
   * @param key - The S3 key to check
   * @returns Promise<boolean>
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      await this.getFileInfo(key);
      return true;
    } catch (error) {
      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * List files in a specific prefix/folder
   * @param prefix - The prefix to search for
   * @param maxKeys - Maximum number of keys to return (default: 1000)
   * @returns Promise<S3FileInfo[]>
   */
  async listFiles(
    prefix?: string,
    maxKeys: number = 1000,
  ): Promise<S3FileInfo[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });

      const response = await this.s3Client.send(command);

      if (!response.Contents) {
        return [];
      }

      return response.Contents.map((object) => ({
        key: object.Key || '',
        size: object.Size || 0,
        lastModified: object.LastModified || new Date(),
        etag: object.ETag || '',
      }));
    } catch (error) {
      this.logger.error(
        `Failed to list files with prefix: ${prefix}`,
        error.stack,
      );
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * Extract S3 key from a presigned URL or S3 URL
   * @param url - The S3 URL
   * @returns string - The extracted key
   */
  extractKeyFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);

      // Handle different S3 URL formats
      if (urlObj.hostname.includes('s3')) {
        // Format: https://bucket.s3.region.amazonaws.com/key
        // or https://s3.region.amazonaws.com/bucket/key
        const pathname = urlObj.pathname;

        if (urlObj.hostname.startsWith(this.bucketName)) {
          // bucket.s3.region.amazonaws.com format
          return pathname.substring(1); // Remove leading slash
        } else {
          // s3.region.amazonaws.com/bucket format
          const pathParts = pathname.split('/');
          pathParts.shift(); // Remove empty string from leading slash
          pathParts.shift(); // Remove bucket name
          return pathParts.join('/');
        }
      }

      return '';
    } catch (error) {
      this.logger.error(`Failed to extract key from URL: ${url}`, error.stack);
      return '';
    }
  }

  /**
   * Generate a unique file key with timestamp and UUID
   * @param originalName - The original filename
   * @param prefix - Optional prefix for the key
   * @returns string - The generated key
   */
  private generateFileKey(originalName: string, prefix?: string): string {
    const timestamp = Date.now();
    const uuid = uuidv4().substring(0, 8);
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');

    const key = `${timestamp}-${uuid}-${sanitizedName}`;
    return prefix ? `${prefix}/${key}` : key;
  }

  /**
   * Get the public URL for a file (if bucket allows public access)
   * @param key - The S3 key
   * @returns string - The public URL
   */
  getPublicUrl(key: string): string {
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * Copy a file within S3
   * @param sourceKey - The source file key
   * @param destinationKey - The destination file key
   * @returns Promise<void>
   */
  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    try {
      // First read the source file
      const sourceBuffer = await this.readFile(sourceKey);

      // Get the source file info to preserve content type
      const sourceInfo = await this.getFileInfo(sourceKey);

      // Create a mock file object for upload
      const mockFile: Express.Multer.File = {
        buffer: sourceBuffer,
        originalname: sourceKey.split('/').pop() || 'copied-file',
        mimetype: sourceInfo.contentType || 'application/octet-stream',
        fieldname: '',
        encoding: '',
        size: sourceBuffer.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      // Upload to destination
      await this.uploadFile(mockFile, destinationKey, {
        contentType: sourceInfo.contentType,
      });

      this.logger.log(
        `Successfully copied file from ${sourceKey} to ${destinationKey}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to copy file from ${sourceKey} to ${destinationKey}`,
        error.stack,
      );
      throw new Error(`Failed to copy file: ${error.message}`);
    }
  }
}
