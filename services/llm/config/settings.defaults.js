// 支持环境变量配置，适应Docker容器环境
export const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/sharelatex?directConnection=true'
export const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
export const PORT = 3012
export const LISTEN_ADDRESS = process.env.LISTEN_ADDRESS || '0.0.0.0'
