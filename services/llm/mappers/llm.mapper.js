import { ApiKeyModel } from '../models/api-key.model.js';

export class LLMMapper {
  constructor() {
    this.model = ApiKeyModel.getModel();
  }
async updateUsedTokens(userIdentifier, tokens) {
  try {
    // 首先查询用户获取usingLlm的值，确定要更新哪个llminfo元素
    const user = await this.model.findOne({ _id: userIdentifier });
    if (!user) {
      console.warn("No user found with the given identifier:", userIdentifier);
      return null;
    }
    
    const { usingLlm } = user;
    
    // 验证usingLlm是否为有效的数组索引
    if (usingLlm < 0 || usingLlm >= user.llminfo.length) {
      console.warn("Invalid usingLlm value for user:", userIdentifier, "usingLlm:", usingLlm);
      return null;
    }
    
    // 构建更新操作，使用位置操作符更新llminfo数组中指定索引的元素
    const updatedDoc = await this.model.findOneAndUpdate(
      { _id: userIdentifier },
      { 
        $inc: { [`llminfo.${usingLlm}.usedTokens`]: tokens || 0 },
        $set: { [`llminfo.${usingLlm}.updatedAt`]: new Date() }
      },
      { new: true, upsert: false, runValidators: true }
    );

    if (!updatedDoc) {
      console.warn("Failed to update tokens for user:", userIdentifier);
    }
    return updatedDoc;
  } catch (err) {
    console.error("Error updating used tokens:", err);
    throw err; // 将错误抛给调用者处理
  }
}

}