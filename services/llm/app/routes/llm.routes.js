import express from 'express';
import { LLMController } from '../controllers/llm.controller.js';

const router = express.Router();
const controller = new LLMController(); //create controller instance

// call llm to chat
router.post('/llm', controller.chat.bind(controller));

// call llm to do completion
router.post('/completion', controller.completion.bind(controller));


export default router;



