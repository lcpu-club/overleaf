// src/app.js
import express from 'express';
import connectDB from './config/db.js';
import keysRoutes from './routes/keys.routes.js';
import llmRoutes from './routes/llm.routes.js'; // 导入 LLM 路由
import cookieParser from 'cookie-parser'; // 导入 cookie 解析中间件
import { PORT,LISTEN_ADDRESS}  from './config/settings.defaults.js';

const app = express();

// // 配置CORS中间件
// const corsOptions = {
//   origin: 'http://192.168.159.128', // 允许的源，根据你的前端地址调整，也可以设置一个数组来允许多个源
//   credentials: true // 允许携带凭证
// };
// app.use(cors(corsOptions));
app.use(cookieParser());

app.use(express.json());

// 连接数据库
await connectDB();

// 注册路由
app.use('/api/v1/llm', keysRoutes);

app.use('/api/v1/llm', llmRoutes);

app.listen(PORT,LISTEN_ADDRESS,() => {
  console.log(`服务运行在端口 ${PORT}`);
});