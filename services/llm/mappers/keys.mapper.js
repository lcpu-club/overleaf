import { ApiKeyModel } from '../models/api-key.model.js';

export class ApiKeyMapper {
  constructor() {
    this.model = ApiKeyModel.getModel();
  }

  /**
     * 保存或更新 llminfo 下的某条 name 信息
     */
  async saveApiKey(userId, name, baseUrl, apiKey, models) {
    // 检查是否已存在相同name的记录
    const existing = await this.model.findOne(
      { _id: userId, "llminfo.name": name }
    );

    if (existing) {
      throw new Error('该API Key名称已存在，请重新输入');
    }

    // 检查llminfo数组是否为空
    const llminfo = await this.getLlmInfo(userId);
    if (llminfo.length === 0) {
      // 更新或添加usingLlm字段
      await this.model.findByIdAndUpdate(
        userId,
        { $set: { usingLlm: 0 } },
        { upsert: true }
      );
    }

    // 插入新记录
    const newInfo = {
      name,
      baseUrl,
      apiKey,
      models,
      updatedAt: new Date(),
      usedTokens: 0,
      usingChatModel: 0,
      usingCompletionModel: 0,
    };

    await this.model.findByIdAndUpdate(
      userId,
      { $push: { llminfo: newInfo } },
      { new: true }
    );
  }

  async deleteApiKey(userIdentifier, name) {
    // 获取当前usingLlm值和llminfo数组
    const user = await this.model.findOne({ _id: userIdentifier });
    const usingLlm = user?.usingLlm;
    const llminfo = user?.llminfo || [];

    // 检查要删除的name是否对应usingLlm索引
    const deleteIndex = llminfo.findIndex(item => item.name === name);
    if (usingLlm !== undefined && usingLlm === deleteIndex) {
      // 如果是正在使用的LLM，先设置usingLlm为-1
      await this.model.findOneAndUpdate(
        { _id: userIdentifier },
        { $set: { usingLlm: -1 } }
      );
    }

    // 删除指定的name记录
    const result = await this.model.findOneAndUpdate(
      { _id: userIdentifier },
      { $pull: { llminfo: { name } } },
      { new: true }
    );
    return result;
  }
  async getLlmInfo(userIdentifier) {
    // 只查找 llminfo 字段
    const user = await this.model.findOne({ _id: userIdentifier }, { llminfo: 1, _id: 0 });
    return user?.llminfo || [];
  }
  async getUsingLlm(userIdentifier) {
    // 获取当前usingLlm值
    const user = await this.model.findOne({ _id: userIdentifier }, { usingLlm: 1, _id: 0 });
    return user?.usingLlm
  }
  async getUsingLlmWithInfo(userIdentifier) {
    // 合并为一次查询；只返回 usingLlm 与 llminfo 数组
    const doc = await this.model.findOne(
      { _id: userIdentifier },
      { usingLlm: 1, llminfo: 1, _id: 0 }
    ).lean();
    return doc || { usingLlm: -1, llminfo: [] };
  }

  async updateUsingLlm(userIdentifier, usingLlm) {
    // 更新 usingLlm 字段
    await this.model.findByIdAndUpdate(
      userIdentifier,
      { $set: { usingLlm } },
      { new: true }
    );
  }

  async updateUsingModel(userIdentifier, name, chatOrCompletion, newModel) {
    console.log('mapper', { userIdentifier, name, chatOrCompletion, newModel });
    // 更新指定 name 的 usingChatModel 或 usingCompletionModel 字段
    if (chatOrCompletion === 0) {//0代表chat
      await this.model.findOneAndUpdate(
        { _id: userIdentifier, "llminfo.name": name },
        { $set: { "llminfo.$.usingChatModel": newModel } },
        { new: true }
      );
    } else if (chatOrCompletion === 1) {//1代表completion
      await this.model.findOneAndUpdate(
        { _id: userIdentifier, "llminfo.name": name },
        { $set: { "llminfo.$.usingCompletionModel": newModel } },
        { new: true }
      );
    } else {
      throw new Error('无效的模型类型');
    }
  }
}
