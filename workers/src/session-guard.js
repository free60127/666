import { sessionUser } from './auth.js';
import { json } from './http.js';

/**
 * 读取会话并区分「未登录」与「数据库不可用」。
 * sessionUser 返回 null 表示身份无效，抛异常则表示服务端暂时不可用。
 */
export async function getSessionUser(db, request, context) {
  try {
    return { user: await sessionUser(db, request), response: null };
  } catch (error) {
    console.error((context || 'session') + ' session lookup error:', error);
    return { user: null, response: json({ error: '服务繁忙，请稍后再试' }, 503) };
  }
}
