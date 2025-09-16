import express from 'express';
import { KeysController } from '../controllers/keys.controller.js';

const router = express.Router();
const controller = new KeysController(); // 创建控制器实例

// 添加服务商
router.post('/keys', controller.saveKey.bind(controller));

// 删除API密钥
router.delete('/keys', controller.deleteKey.bind(controller));

// 获取用户自己的llm信息
router.get('/keys', controller.getLlmInfo.bind(controller));

//获取当前使用的llm
router.get('/usingLlm', controller.getUsingLlm.bind(controller));

router.put('/usingLlm', controller.updateUsingLlm.bind(controller));

router.put('/usingModel', controller.updateUsingModel.bind(controller));

export default router;

