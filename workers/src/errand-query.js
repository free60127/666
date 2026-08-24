export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

export const TASK_SELECT =
  'SELECT t.id, t.publisher_id, t.title, t.description, t.reward, t.pickup, t.dropoff, t.contact, ' +
  't.deadline, t.status, t.taker_id, t.created_at, t.updated_at, t.completed_at, t.confirmed_at, t.confirmed_by, t.auto_confirmed_at, t.cancelled_at, t.cancel_reason, ' +
  'u.nickname AS publisher_name, u2.nickname AS taker_name ' +
  'FROM errand_tasks t ' +
  'LEFT JOIN users u ON u.id = t.publisher_id ' +
  'LEFT JOIN users u2 ON u2.id = t.taker_id ';

export const mapTask = (r) => r ? ({
  id: r.id, publisherId: r.publisher_id, title: r.title, description: r.description,
  reward: r.reward, pickup: r.pickup, dropoff: r.dropoff, contact: r.contact,
  deadline: r.deadline, status: r.status, takerId: r.taker_id,
  createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at,
  confirmedAt: r.confirmed_at, confirmedBy: r.confirmed_by, autoConfirmedAt: r.auto_confirmed_at,
  cancelledAt: r.cancelled_at, cancelReason: r.cancel_reason,
  publisherName: r.publisher_name, takerName: r.taker_name,
}) : null;
