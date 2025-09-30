const { req } = require('@overleaf/logger/serializers')
const Settings = require('@overleaf/settings')
const fetch = require('node-fetch')
async function base(req, res, url) {
    try {
        const llmUrl = Settings.apis?.llm?.url
        if (!llmUrl) {
            return res.status(400).json({ success: false, data: 'LLM service URL not configured' })
        }
        // build target URL
        const targetUrl = `${llmUrl}${url}`
        // forward the request to LLM service
        const fetchOptions = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                ...(req.headers.authorization && {
                    'Authorization': req.headers.authorization
                }),
                ...(req.headers['user-agent'] && {
                    'User-Agent': req.headers['user-agent']
                }),
                ...(req.headers.cookie && {
                    'Cookie': req.headers.cookie
                }),
                ...(req.headers['accept-language'] && {
                    'Accept-Language': req.headers['accept-language']
                }),
            },
            signal: AbortSignal.timeout(60000)
        };
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            if (req.body) {
                fetchOptions.body = JSON.stringify(req.body);
            }
        }
        const response = await fetch(targetUrl, fetchOptions);
        if (!response.ok) {
            console.log("LLM service responded with error:",await response.text())
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
    async createCompletion(req, res) {
        return base(req, res, '/api/v1/llm/completion')
    },
    async llm(req, res) {
        return base(req, res, '/api/v1/llm/llm')
    },
    async keys(req, res) {
        return base(req, res, '/api/v1/llm/keys')
    },
    async usingLlm(req, res) {
        return base(req, res, '/api/v1/llm/usingLlm')
    },
    async usingModel(req, res) {
        return base(req, res, '/api/v1/llm/usingModel')
    },
}