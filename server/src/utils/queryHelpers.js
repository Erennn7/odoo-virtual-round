/**
 * Shared list-query helpers: pagination, sorting (whitelisted columns),
 * and a tiny builder for accumulating WHERE clauses with positional params.
 */

export function getPagination(query, defaults = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaults.limit || 10));
  return { page, limit, offset: (page - 1) * limit };
}

export function getSort(query, allowed, fallback) {
  const sort = allowed[query.sort] ? query.sort : fallback;
  const order = String(query.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return `${allowed[sort]} ${order}`;
}

/** Accumulates `WHERE` conditions and `$n` params without string concatenation of values. */
export class WhereBuilder {
  constructor() { this.conditions = []; this.params = []; }
  add(sqlFragment, ...values) {
    let fragment = sqlFragment;
    for (const value of values) {
      this.params.push(value);
      fragment = fragment.replace('?', `$${this.params.length}`);
    }
    this.conditions.push(fragment);
    return this;
  }
  get clause() { return this.conditions.length ? `WHERE ${this.conditions.join(' AND ')}` : ''; }
  /** Next positional index, for appending LIMIT/OFFSET params. */
  next(value) { this.params.push(value); return `$${this.params.length}`; }
}

/** Standard paginated response envelope. */
export function paginated(rows, total, { page, limit }) {
  return {
    success: true,
    data: rows,
    pagination: { page, limit, total: Number(total), totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
