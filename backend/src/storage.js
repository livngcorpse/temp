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

require('dotenv').config();

// Use the Supabase storage adapter exclusively
module.exports = require('./storage.supabase');
