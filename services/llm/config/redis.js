import Redis from 'ioredis';
import { REDIS_URL } from './settings.defaults.js'; 

const redis = new Redis(REDIS_URL);

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

export default redis;


