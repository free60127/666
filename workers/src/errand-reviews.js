import { sessionUser } from './auth.js';
import { json } from './http.js';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

const REVIEW_SELECT =
  'SELECT r.id, r.task_id, r.reviewer_id, r.reviewee_id, r.rating, r.comment, r.created_at, u.nickname AS reviewer_name ' +
  'FROM errand_reviews r LEFT JOIN users u ON u.id = r.reviewer_id ';
const mapReviewPublic = (r) => r ? ({ id: r.id, taskId: r.task_id,
  rating: r.rating, comment: r.comment, createdAt: r.created_at, reviewerName: r.reviewer_name }) : null;

export async function createReview(db, request) {
  const user = await sessionUser(db, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'invalid json' }, 400);
  const taskId = Math.floor(num(body.taskId));
  if (!Number.isInteger(taskId) || taskId <= 0) return json({ error: 'invalid taskId' }, 400);
  const rating = Math.floor(num(body.rating));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: '评分需为 1~5 的整数' }, 400);
  const comment = String(body.comment || '').trim().slice(0, 200);
  try {
    const task = await db.prepare('SELECT id, publisher_id, taker_id, confirmed_at FROM errand_tasks WHERE id = ?').bind(taskId).first();
    if (!task) return json({ error: '任务不存在' }, 404);
    if (!task.confirmed_at) return json({ error: '任务确认完成后才能评价' }, 400);
    const isPublisher = task.publisher_id === user.id;
    const isTaker = task.taker_id === user.id;
    if (!isPublisher && !isTaker) return json({ error: '只有任务双方可以评价' }, 403);
    const revieweeId = isPublisher ? task.taker_id : task.publisher_id;
    if (!revieweeId) return json({ error: '对方账号不存在' }, 400);
    const dup = await db.prepare('SELECT id FROM errand_reviews WHERE task_id = ? AND reviewer_id = ?').bind(taskId, user.id).first();
    if (dup) return json({ error: '已评价过该任务' }, 400);
    const result = await db.prepare(
      'INSERT INTO errand_reviews (task_id, reviewer_id, reviewee_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(taskId, user.id, revieweeId, rating, comment, Date.now()).run();
    const row = await db.prepare(REVIEW_SELECT + 'WHERE r.id = ?').bind(result.meta.last_row_id).first();
    return json({ ok: true, review: mapReviewPublic(row) }, 201);
  } catch (error) {
    // 并发双发：UNIQUE(task_id, reviewer_id) 约束兜底
    if (String(error && error.message || '').includes('UNIQUE constraint failed')) {
      return json({ error: '已评价过该任务' }, 400);
    }
    console.error('errand review error:', error);
    return json({ error: 'internal error' }, 500);
  }
}

export async function listReviews(db, request) {
  const url = new URL(request.url);
  const taskId = Math.floor(num(url.searchParams.get('taskId')));
  if (!Number.isInteger(taskId) || taskId <= 0) return json({ error: 'invalid taskId' }, 400);
  try {
    const rows = await db.prepare(REVIEW_SELECT + 'WHERE r.task_id = ? ORDER BY r.created_at DESC').bind(taskId).all();
    return json({ reviews: (rows && rows.results ? rows.results : []).map(mapReviewPublic) });
  } catch (error) {
    console.error('errand reviews list error:', error);
    return json({ error: 'internal error' }, 500);
  }
}
