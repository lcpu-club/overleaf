import redis from '../../config/redis.js';
export const extractIdentifier = (cookieValue) => {
  // example: s:abc123.def456ghi789.jkl012mno345pqr678stu901vwx234yz567
  const parts = cookieValue.split(':');
  if (parts.length < 2) return null;

  const mainPart = parts[1];
  // get substring before the first dot
  const dotIndex = mainPart.indexOf('.');
  if (dotIndex === -1) return null; // invalid format

  return mainPart.substring(0, dotIndex);
};

export const getUserIdentifier = async (sid) => {

  const extractsid = extractIdentifier(sid);

  if (!extractsid) throw new Error('invalid session id format');

  const redisInfo = await redis.get('sess:' + extractsid);
  if (!redisInfo) throw new Error('session not found in Redis');

  const sessionData = JSON.parse(redisInfo);
  if (!sessionData || !sessionData.passport || !sessionData.passport.user) {
    throw new Error('session data format is incorrect');
  }

  const userIdentifier = sessionData.passport.user._id;
  return userIdentifier;
};

function removeCompletionPrefix(str) {
    // define the prefix to remove
    const prefix = '<COMPLETION>';
    const prefix2 = '<COMPLETION/>'
    
    // check if the string starts with the prefix
    if (str.startsWith(prefix)) {
        // return the string without the prefix
        return str.slice(prefix.length);
    }
    if(str.startsWith(prefix2)){
        return str.slice(prefix2.length);
    }
    // return the original string if no prefix matched
    return str.trim();
}
/**
 * delete content after the last newline (including the newline itself)
 * @param {string} message - input text
 * @param {Object} [opts]
 * @param {boolean} [opts.keepLastNewline=true] - if true, keep the last newline character(s)
 * @param {boolean} [opts.trimTrailingWhitespace=true] - if true, trim trailing whitespace after cutting
 * @returns {string} - processed text
 */
function removeAfterLastNewline(message, opts = {}) {
  if (typeof message !== 'string') return message;
  const { keepLastNewline = true, trimTrailingWhitespace = true } = opts;

  const s = message;
  // find the last newline sequence (\r\n, \n, or \r)
  const regex = /\r\n|\n|\r/g;
  let lastMatch = null;
  for (const m of s.matchAll(regex)) {
    lastMatch = m; // keep track of the last match
  }

  // no newline found, return original string
  if (!lastMatch) return s;

  const idx = lastMatch.index;
  const nlLen = lastMatch[0].length;

  const cutIndex = keepLastNewline ? idx + nlLen : idx;
  let out = s.slice(0, cutIndex);

  if (trimTrailingWhitespace) out = out.replace(/\s+$/u, '');

  return out.trim();
}

/**
 * remove trailing incomplete token prefixes from the end of the string
 *
 * @param {string} str - string to process
 * @param {string} [token='<COMPLETION/>'] - target token
 * @param {number} [minPrefixLen=2] - minimum matching prefix length (default is 2)
 * @returns {string} - processed string
 */
function removeTrailingTokenPrefix(str, token = '<COMPLETION/>', minPrefixLen = 2) {
  if (typeof str !== 'string' || !str.length) return str;
  if (typeof token !== 'string' || token.length < minPrefixLen) return str;

  // try to match the longest possible prefix first
  for (let len = token.length; len >= minPrefixLen; len--) {
    const suffix = token.slice(0, len);
    if (str.endsWith(suffix)) {
      return str.slice(0, str.length - len);
    }
  }
  return str;
}

export function formatResult(str){
  let result = removeCompletionPrefix(str);//clear <COMPLETION> or <COMPLETION/>
  let result1 = removeAfterLastNewline(result, { keepLastNewline: false, trimTrailingWhitespace: true });//clear after last newline
  let result2 = removeTrailingTokenPrefix(result1, '<COMPLETION/>', 2);//clear trailing incomplete <COMPLETION/> prefix
  return result2.trim(); //clear leading/trailing whitespace
}



