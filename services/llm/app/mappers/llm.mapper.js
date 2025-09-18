import { ApiKeyModel } from '../models/api-key.model.js';

export class LLMMapper {
  constructor() {
    this.model = ApiKeyModel.getModel();
  }
  async updateUsedTokens(userIdentifier, tokens) {
    try {
      // first, get the user document to find usingLlm value
      const user = await this.model.findOne({ _id: userIdentifier });
      if (!user) {
        console.warn("No user found with the given identifier:", userIdentifier);
        return null;
      }

      const { usingLlm } = user;

      // check if usingLlm is a valid index
      if (usingLlm < 0 || usingLlm >= user.llminfo.length) {
        console.warn("Invalid usingLlm value for user:", userIdentifier, "usingLlm:", usingLlm);
        return null;
      }

      // update the usedTokens and updatedAt for the selected llm
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
      throw err;
    }
  }

}



