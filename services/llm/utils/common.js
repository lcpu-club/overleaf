import redis from '../config/redis.js';
export const extractIdentifier = (cookieValue) => {
  // 分割前缀和主体
  const parts = cookieValue.split(':');
  if (parts.length < 2) return null; // 格式不正确

  const mainPart = parts[1];
  // 提取点号之前的内容
  const dotIndex = mainPart.indexOf('.');
  if (dotIndex === -1) return null; // 格式不正确

  return mainPart.substring(0, dotIndex);
};

export const getUserIdentifier = async (sid) => {

  const extractsid = extractIdentifier(sid);

  if (!extractsid) throw new Error('无效的 SID');

  const redisInfo = await redis.get('sess:' + extractsid);
  if (!redisInfo) throw new Error('Redis 中未找到会话信息');

  const sessionData = JSON.parse(redisInfo);
  if (!sessionData || !sessionData.passport || !sessionData.passport.user) {
    throw new Error('会话数据格式不正确');
  }

  const userIdentifier = sessionData.passport.user._id;
  return userIdentifier;
};

function removeCompletionPrefix(str) {
    // 定义要检查的前缀
    const prefix = '<COMPLETION>';
    const prefix2 = '<COMPLETION/>'
    
    // 检查字符串是否以前缀开头
    if (str.startsWith(prefix)) {
        // 如果是，返回去掉前缀后的部分
        return str.slice(prefix.length);
    }
    if(str.startsWith(prefix2)){
        return str.slice(prefix2.length);
    }
    // 如果不是，返回原字符串
    return str.trim();
}
/**
 * 删除字符串中最后一个换行符后面的内容。
 * @param {string} message - 输入文本
 * @param {Object} [opts]
 * @param {boolean} [opts.keepLastNewline=true] - 是否保留最后那个换行符本身
 * @param {boolean} [opts.trimTrailingWhitespace=true] - 是否去掉返回末尾的多余空白
 * @returns {string} 处理后的文本
 */
function removeAfterLastNewline(message, opts = {}) {
  if (typeof message !== 'string') return message;
  const { keepLastNewline = true, trimTrailingWhitespace = true } = opts;

  const s = message;
  // 找到最后一个换行（支持 CRLF, LF, CR）
  const regex = /\r\n|\n|\r/g;
  let lastMatch = null;
  for (const m of s.matchAll(regex)) {
    lastMatch = m; // 最终保留最后一次匹配
  }

  // 没有找到换行，原样返回
  if (!lastMatch) return s;

  const idx = lastMatch.index;        // 换行序列起始位置
  const nlLen = lastMatch[0].length; // 换行序列长度（1 或 2）

  const cutIndex = keepLastNewline ? idx + nlLen : idx;
  let out = s.slice(0, cutIndex);

  if (trimTrailingWhitespace) out = out.replace(/\s+$/u, '');

  return out.trim();
}

/**
 * 移除字符串末尾如果是 token 的不完整前缀（或完整 token）则把它删掉。
 *
 * @param {string} str - 待处理字符串
 * @param {string} [token='<COMPLETION/>'] - 目标 token
 * @param {number} [minPrefixLen=2] - 最小匹配前缀长度（默认为 2）
 * @returns {string} - 处理后的字符串
 */
function removeTrailingTokenPrefix(str, token = '<COMPLETION/>', minPrefixLen = 2) {
  if (typeof str !== 'string' || !str.length) return str;
  if (typeof token !== 'string' || token.length < minPrefixLen) return str;

  // 尝试从最长前缀向下匹配（包含完整 token）
  for (let len = token.length; len >= minPrefixLen; len--) {
    const suffix = token.slice(0, len);
    if (str.endsWith(suffix)) {
      return str.slice(0, str.length - len);
    }
  }
  return str;
}

export function formatResult(str){
  let result = removeCompletionPrefix(str);//清除前缀
  let result1 = removeAfterLastNewline(result, { keepLastNewline: false, trimTrailingWhitespace: true });//清除最后一个换行符及其后内容
  let result2 = removeTrailingTokenPrefix(result1, '<COMPLETION/>', 2);//清除末尾不完整的<COMPLETION/>前缀后缀
  return result2.trim(); //最终去除前后空白
}




//llm:sid:{}