// src/models/api-key.model.js
import mongoose from 'mongoose';

const apiKeySchema = new mongoose.Schema({
  llminfo: [
    {
      provider: String,
      apiKey: String,
      name: String,
      baseUrl: String,
      models: [
        {
          id: String,
          object: String,
          owned_by: String
        }
      ],
      usingChatModel: Number,
      usingCompletionModel: Number,
      usedTokens: { type: Number, default: 0 },
      updatedAt: { type: Date, default: Date.now }
    }
  ],
  usingLlm: { type: Number, default: 0 }
});


export class ApiKeyModel {
  static getModel() {
    return mongoose.model('users', apiKeySchema);
  }
}



