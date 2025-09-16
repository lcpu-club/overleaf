const { req } = require('@overleaf/logger/serializers')
const Settings = require('@overleaf/settings')
const fetch = require('node-fetch')
async function base(req, res, url) {
    try {
        const llmUrl = Settings.apis?.llm?.url
        if (!llmUrl) {
            return res.status(400).json({ success: false, data: 'LLM service URL not configured' })
        }
        // 构建请求URL
        const targetUrl = `${llmUrl}${url}`

        // 转发请求到LLM服务
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                // 转发相关的请求头
                ...(req.headers['user-agent'] && { 'User-Agent': req.headers['user-agent'] }),
                ...(req.headers.cookie && { 'Cookie': req.headers.cookie })
            },
            // 如果是POST请求，转发请求体
            ...(['POST', 'PUT', 'PATCH'].includes(req.method) && { body: JSON.stringify(req.body) })
        })

        if (!response.ok) {
            throw new Error(`LLM service responded with status: ${response.status}`)
        }

        const data = await response.json()
        res.status(200).json(data);
    } catch (error) {
        console.error('Error proxying to LLM service:', error)
        res.status(400).json({ success: false, data: error.message });
    }
}
module.exports = {
    async createCompletion(req, res) {///api/v1/llm/completion
        return base(req, res, '/api/v1/llm/completion')
    },
    async llm(req, res) {///api/v1/llm/llm
        return base(req, res, '/api/v1/llm/llm')
    },
    async keys(req, res) {///api/v1/llm/keys
        return base(req, res, '/api/v1/llm/keys')
    },
    async usingLlm(req, res) {///api/v1/llm/usingLlm
        return base(req, res, '/api/v1/llm/usingLlm')
    },
    async usingModel(req, res) {///api/v1/llm/usingModel
        return base(req, res, '/api/v1/llm/usingModel')
    },
}