import { LLMService } from "../services/llm.service.js";
import {getUserIdentifier} from '../utils/common.js';
export class LLMController {
  constructor() {
    this.llmService = new LLMService();
  }
  async chat(req, res) {
    try {
      const sid = req.cookies['overleaf.sid'];
      const userIdentifier = await getUserIdentifier(sid);
     // console.log('llmcontroller:',userIdentifier)

      const { ask, selection, filelist, outline, mode } = req.body;
      //console.log('llmcontroller body:',ask, selection, filelist, outline, mode)
      const content  = await this.llmService.chat(
        userIdentifier, ask, selection, filelist, outline, mode
      );
      res.status(200).json({
        success: true,
        data: content
      });
    } catch (error) {
      res.status(400).json({ success: false, data:error.message  });
    }
  }
  /**
   * 处理补全请求
   */
  async completion(req, res) {
    try {
      const sid = req.cookies['overleaf.sid'];
      const userIdentifier = await getUserIdentifier(sid);
      console.log('userIdentifier:', userIdentifier);
      const { cursorOffset, leftContext, rightContext, language, maxLength, fileList, outline } = req.body;

      const  content  = await this.llmService.completion(
        userIdentifier, cursorOffset, leftContext, rightContext, language, maxLength, fileList, outline
      );
      //const content = "helo world";
      console.log('completion content:', content);
      res.status(200).json({
        success: true,
        data: content
      });
    } catch (err) {
      console.error('代码补全错误:', err);
      res.status(400).json({ success: false, data:err.message  });
    }
  }
}
