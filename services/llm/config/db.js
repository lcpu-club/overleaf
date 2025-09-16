import mongoose from 'mongoose'; // 新增
import {MONGO_URL} from './settings.defaults.js';

// 数据库配置
export const dbConfig = {
  uri: MONGO_URL,
  options: {
    connectTimeoutMS: 30000, // 连接超时时间
    socketTimeoutMS: 45000,  // 套接字超时时间
  }
};


// 导出连接函数并传递配置
export default async function connectDatabase() {
  try {
    await mongoose.connect(dbConfig.uri, dbConfig.options); // 使用 mongoose.connect
    console.log('MongoDB 连接成功');
  } catch (error) {
    console.error('MongoDB 连接失败:', error);
    process.exit(1);
  }
}