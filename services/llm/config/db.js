import mongoose from 'mongoose';
import {MONGO_URL} from './settings.defaults.js';

export const dbConfig = {
  uri: MONGO_URL,
  options: {
    connectTimeoutMS: 30000, // connection timeout
    socketTimeoutMS: 45000,  // socket timeout
  }
};


// export connection function with configuration
export default async function connectDatabase() {
  try {
    await mongoose.connect(dbConfig.uri, dbConfig.options);
    console.log('MongoDB connection successful');
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
}
