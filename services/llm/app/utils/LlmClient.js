// LlmClient.js
import axios from 'axios';
import http from 'http';
import https from 'https';


export class LlmClient {
  /**
   * @param {string} baseUrl
   * @param {string} apiKey
   * @param {Object} options
   *   - timeout (ms)
   *   - keepAlive (bool)
   *   - maxSockets (number)
   *   - retries (number) simple retry on network errors/timeouts
   */
  constructor(baseUrl, apiKey, options = {}) {
    const { timeout = 30000, keepAlive = true, maxSockets = 100, retries = 0 } = options;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.retries = retries;

    const isHttps = baseUrl.startsWith('https');
    // Create an agent enabling keep-alive and max sockets
    this._agent = isHttps
      ? new https.Agent({ keepAlive, maxSockets })
      : new http.Agent({ keepAlive, maxSockets });

    this.client = axios.create({
      baseURL: baseUrl,
      timeout,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      // axios supports httpAgent / httpsAgent for node
      httpAgent: this._agent,
      httpsAgent: this._agent,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
  }

  async _postWithRetry(path, data) {
    let lastErr;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await this.client.post(path, data);
        return response.data;
      } catch (err) {
        lastErr = err;
        // If it's last attempt, break and throw below
        const shouldRetry = attempt < this.retries && (!err.response || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED');
        if (!shouldRetry) break;
        // small backoff
        await new Promise(r => setTimeout(r, 100 * (attempt + 1)));
      }
    }
    // normalize error message
    const message = lastErr && lastErr.response
      ? `status ${lastErr.response.status}: ${JSON.stringify(lastErr.response.data)}`
      : (lastErr && lastErr.message) || 'unknown network error';
    throw new Error(message);
  }

  async listModels() {
    try {
      const resp = await this.client.get('/v1/models');
      return resp.data.data.map(model => ({
        id: model.id,
        object: model.object,
        owned_by: model.owned_by
      }));
    } catch (error) {
      throw new Error(`get model error: ${error.message}`);
    }
  }

  async chat(messages, model, options = {}) {
    try {
      const max_tokens = 5000, temperature = 0.7;
      const data = { model, messages, max_tokens, temperature };
      const response = await this._postWithRetry('/v1/chat/completions', data);
      return response;
    } catch (error) {
      throw new Error(`completion error: ${error.message}`);
    }
  }

  async completion(messages, model, options = {}) {
    try {
      const max_tokens = 50, temperature = 0, top_p = 1, max_completion_tokens = 50;
      const stop = ["</COMPLETION>", ",", "，"];
      const data = { model, messages, temperature, top_p, stop, max_completion_tokens };
      console.log(data);
      const response = await this._postWithRetry('/v1/chat/completions', data);
      return response;
    } catch (error) {
      throw new Error(`chat error: ${error.message}`);
    }
  }


  // call when removing client from pool to free sockets
  close() {
    try {
      if (this._agent && typeof this._agent.destroy === 'function') {
        this._agent.destroy();
      }
    } catch (e) {
      console.log(e);
    }
  }
}



