const { S3Client } = require('@aws-sdk/client-s3');

const getRequiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured in environment variables`);
  }
  return value;
};

const createR2Client = () => {
  return new S3Client({
    region: 'auto',
    endpoint: getRequiredEnv('R2_ENDPOINT'),
    credentials: {
      accessKeyId: getRequiredEnv('R2_ACCESS_KEY'),
      secretAccessKey: getRequiredEnv('R2_SECRET_KEY')
    }
  });
};

const encodeR2Key = (key) => key.split('/').map(encodeURIComponent).join('/');

const getR2PublicUrl = (key) => {
  const publicUrl = getRequiredEnv('R2_PUBLIC_URL').replace(/\/+$/, '');
  return `${publicUrl}/${encodeR2Key(key)}`;
};

module.exports = {
  createR2Client,
  getR2PublicUrl,
  getRequiredEnv
};