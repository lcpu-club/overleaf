const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/sharelatex?directConnection=true'
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
const PORT = 3012
const LISTEN_ADDRESS = process.env.LISTEN_ADDRESS || '0.0.0.0'


module.exports = {
    MONGO_URL,
    REDIS_URL,
    PORT,
    LISTEN_ADDRESS
}

