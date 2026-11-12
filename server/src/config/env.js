const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5500',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_cab_simulation',
  osrmBaseUrl: process.env.OSRM_BASE_URL || 'https://router.project-osrm.org'
};

module.exports = env;

