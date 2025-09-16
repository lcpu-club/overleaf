import express from 'express';
import { LLMController } from '../controllers/llm.controller.js';

const router = express.Router();
const controller = new LLMController(); // 创建控制器实例

// 调用LLM
router.post('/llm', controller.chat.bind(controller));

// 补全
router.post('/completion', controller.completion.bind(controller));


export default router;
