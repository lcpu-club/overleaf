import Redis from 'ioredis';
import { REDIS_URL } from './settings.defaults.js'; 

const redis = new Redis(REDIS_URL);

redis.on('connect', () => {
  console.log('Redis 连接成功');
});

redis.on('error', (err) => {
  console.error('Redis 连接失败:', err);
});

export default redis;