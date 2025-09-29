import Redis from 'ioredis';
import settings from '@overleaf/settings'

const redis = new Redis(settings.REDIS_URL);

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

export default redis;


