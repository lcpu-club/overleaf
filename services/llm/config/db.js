import mongoose from 'mongoose';
import settings from '@overleaf/settings'

export const dbConfig = {
  uri: settings.MONGO_URL,
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
