import express from 'express';
import { KeysController } from '../controllers/keys.controller.js';

const router = express.Router();
const controller = new KeysController();

// add or update 
router.post('/keys', controller.saveKey.bind(controller));

// delete api key
router.delete('/keys', controller.deleteKey.bind(controller));

// get user llm info
router.get('/keys', controller.getLlmInfo.bind(controller));

// get current using llm
router.get('/usingLlm', controller.getUsingLlm.bind(controller));

// get current using llm with info
router.put('/usingLlm', controller.updateUsingLlm.bind(controller));

// update using chat or completion model for the given api key name
router.put('/usingModel', controller.updateUsingModel.bind(controller));

export default router;



