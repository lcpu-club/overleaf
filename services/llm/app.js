// src/app.js
import express from 'express';
import connectDB from './config/db.js';
import keysRoutes from './app/routes/keys.routes.js';
import llmRoutes from './app/routes/llm.routes.js';
import cookieParser from 'cookie-parser';
import settings from '@overleaf/settings'

const app = express();

app.use(cookieParser());

app.use(express.json());

// connect to database
await connectDB();

// register routes
app.use('/api/v1/llm', keysRoutes);

app.use('/api/v1/llm', llmRoutes);

app.listen(settings.PORT, settings.LISTEN_ADDRESS, () => {
  console.log(`server running on ${settings.PORT}`);
});


