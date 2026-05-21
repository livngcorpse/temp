const fs = require('fs');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const bucketName = process.env.S3_BUCKET_NAME;
const endpoint = process.env.S3_ENDPOINT;
const region = process.env.S3_REGION || 'auto';
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';

if (!bucketName || !endpoint || !accessKeyId || !secretAccessKey) {
  console.warn('Warning: Cloud storage environment vars are not fully configured. S3/R2 upload/download may fail.');
}

const s3 = new S3Client({
  region,
  endpoint,
  forcePathStyle,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

function ensureStorageConfig() {
  if (!bucketName) {
    throw new Error('Missing S3_BUCKET_NAME');
  }
  if (!endpoint) {
    throw new Error('Missing S3_ENDPOINT');
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Missing S3_ACCESS_KEY_ID or S3_SECRET_ACCESS_KEY');
  }
}

async function uploadFileToStorage(localPath, key, contentType = 'application/octet-stream') {
  ensureStorageConfig();

  if (!fs.existsSync(localPath)) {
    throw new Error(`Local file not found: ${localPath}`);
  }

  const fileStream = fs.createReadStream(localPath);
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileStream,
    ContentType: contentType,
  });

  await s3.send(command);
}

async function getStorageFileStream(key) {
  ensureStorageConfig();

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const response = await s3.send(command);

  if (!response.Body) {
    throw new Error('Storage object body missing');
  }

  return response.Body;
}

async function deleteStorageFile(key) {
  ensureStorageConfig();

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await s3.send(command);
}

module.exports = {
  uploadFileToStorage,
  getStorageFileStream,
  deleteStorageFile,
};
