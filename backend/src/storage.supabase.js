const fs = require('fs');
const { Readable } = require('stream');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.SUPABASE_BUCKET_NAME;

if (!supabaseUrl || !supabaseKey || !bucketName) {
  console.warn('Warning: Supabase storage env vars are missing.');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

async function uploadFileToStorage(localPath, key, contentType = 'application/octet-stream') {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local file not found: ${localPath}`);
  }

  const stream = fs.createReadStream(localPath);

  const { error } = await supabase.storage.from(bucketName).upload(key, stream, {
    cacheControl: '3600',
    contentType,
    upsert: false,
  });

  if (error) {
    throw error;
  }
}

async function getStorageFileStream(key) {
  const { data, error } = await supabase.storage.from(bucketName).download(key);
  if (error) {
    throw error;
  }
  // Convert Blob to Buffer to Node.js Readable stream
  const buffer = await data.arrayBuffer();
  return Readable.from(Buffer.from(buffer));
}

async function deleteStorageFile(key) {
  const { error } = await supabase.storage.from(bucketName).remove([key]);
  if (error) {
    throw error;
  }
}

module.exports = {
  uploadFileToStorage,
  getStorageFileStream,
  deleteStorageFile,
};
