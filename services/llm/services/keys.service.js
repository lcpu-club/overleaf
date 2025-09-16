import { ApiKeyMapper } from '../mappers/keys.mapper.js';
import { LlmClient } from '../utils/LlmClient.js';

export class KeysService {
  constructor() {
    this.apiKeyMapper = new ApiKeyMapper();
  }

  async saveApiKey(userIdentifier, name, baseUrl, apiKey) {
    if (!userIdentifier) throw new Error('用户标识不能为空');
    if (!name) throw new Error('名称不能为空');
    if (!baseUrl) throw new Error('Base URL不能为空');
    if (!apiKey) throw new Error('API Key不能为空');
    try {
      const client = new LlmClient(baseUrl, apiKey);
      const models = await client.listModels();
      console.log(models);
      await this.apiKeyMapper.saveApiKey(userIdentifier, name, baseUrl, apiKey, models);
    } catch (error) {
      throw error;
    }
  }
  async deleteApiKey(userIdentifier, name) {
    await this.apiKeyMapper.deleteApiKey(userIdentifier, name);
  }

  async getLlmInfo(userIdentifier) {
    const llminfoArr = await this.apiKeyMapper.getLlmInfo(userIdentifier);
    return llminfoArr.map(info => ({
      provider: info.provider,
      updatedAt: info.updatedAt,
      usedTokens: (info.usedTokens/1000).toFixed(2)+'k'|| 0,
      usingChatModel: info.usingChatModel,
      usingCompletionModel: info.usingCompletionModel,
      models: info.models || [],
      name: info.name,
    }));
  }
  async getUsingLlm(userIdentifier) {
    // 获取当前usingLlm值
    const usingLlm = await this.apiKeyMapper.getUsingLlm(userIdentifier);
    return usingLlm;
  }

  async updateUsingLlm(userIdentifier, usingLlm) {
    await this.apiKeyMapper.updateUsingLlm(userIdentifier, usingLlm);
  }

  async updateUsingModel(userIdentifier, name, chatOrCompletion,newModel) {
    console.log("service",userIdentifier, name, chatOrCompletion,newModel);
    await this.apiKeyMapper.updateUsingModel(userIdentifier, name, chatOrCompletion,newModel);
  }
}
