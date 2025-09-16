import { KeysService } from '../services/keys.service.js';
import {getUserIdentifier} from '../utils/common.js';
export class KeysController {
  constructor() {
    this.keysService = new KeysService();
  }

  async saveKey(req, res) {
    try {
      const sid = req.cookies['overleaf.sid'];
      const userIdentifier = await getUserIdentifier(sid);
      const { name, baseUrl, apiKey } = req.body;
      
      await this.keysService.saveApiKey(userIdentifier, name, baseUrl, apiKey);
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, data: error.message });
    }
  }
  async deleteKey(req, res) {
    try {
      const sid = req.cookies['overleaf.sid'];
      const userIdentifier = await getUserIdentifier(sid);
      const { name } = req.body;
      console.log(name)
      const result = await this.keysService.deleteApiKey(userIdentifier, name);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, data: error.message });
    }
  }

  async getLlmInfo(req, res) {
    try {
      const sid = req.cookies['overleaf.sid'];
      const userIdentifier = await getUserIdentifier(sid);
      const result = await this.keysService.getLlmInfo(userIdentifier);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, data: error.message  });
    }
  }
  async getUsingLlm(req, res) {
    try {
      const sid = req.cookies['overleaf.sid'];
      const userIdentifier = await getUserIdentifier(sid);
      const result = await this.keysService.getUsingLlm(userIdentifier);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, data: error.message });
    }
  }


  async updateUsingLlm(req, res) {
    try {
      const sid = req.cookies['overleaf.sid'];
      const userIdentifier = await getUserIdentifier(sid);
      const { usingLlm } = req.body;
      await this.keysService.updateUsingLlm(userIdentifier, usingLlm);
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, data: error.message });
    }
  }
  async updateUsingModel(req, res) {
    try {
      const sid = req.cookies['overleaf.sid'];
      const userIdentifier = await getUserIdentifier(sid);
      const { name, chatOrCompletion, newModel } = req.body;
      await this.keysService.updateUsingModel(userIdentifier, name, chatOrCompletion, newModel);
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, data: error.message });
    }
  }
}