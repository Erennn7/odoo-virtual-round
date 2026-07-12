import { ApiError } from '../utils/ApiError.js';

/**
 * Single source of truth for asset status changes.
 * - Locks the asset row (FOR UPDATE) so concurrent workflows serialize.
 * - Relies on the DB trigger as a second line of defense for invalid transitions,
 *   but validates here first for a friendly error.
 * - Appends to asset_status_history — history is never overwritten.
 */
const TRANSITIONS = {
  AVAILABLE: ['ALLOCATED', 'RESERVED', 'UNDER_MAINTENANCE', 'LOST', 'RETIRED'],
  ALLOCATED: ['AVAILABLE', 'UNDER_MAINTENANCE', 'LOST'],
  RESERVED: ['AVAILABLE', 'ALLOCATED'],
  UNDER_MAINTENANCE: ['AVAILABLE', 'ALLOCATED', 'RETIRED', 'DISPOSED'],
  LOST: ['AVAILABLE', 'DISPOSED'],
  RETIRED: ['DISPOSED'],
  DISPOSED: [],
};

export function assertTransition(from, to) {
  if (from === to) return;
  if (!TRANSITIONS[from]?.includes(to)) {
    throw ApiError.badRequest(`Invalid lifecycle transition: ${from} → ${to}`);
  }
}

/** Lock and return the asset row inside a transaction. */
export async function lockAsset(client, assetId) {
  const { rows } = await client.query(`SELECT * FROM assets WHERE id = $1 FOR UPDATE`, [assetId]);
  if (!rows[0]) throw ApiError.notFound('Asset not found');
  return rows[0];
}

export async function changeAssetStatus(client, { asset, toStatus, actor, reason }) {
  if (asset.status === toStatus) return asset;
  assertTransition(asset.status, toStatus);
  const retiredAt = toStatus === 'RETIRED' ? 'now()' : 'retired_at';
  const { rows } = await client.query(
    `UPDATE assets SET status = $1, retired_at = ${retiredAt} WHERE id = $2 RETURNING *`,
    [toStatus, asset.id]
  );
  await client.query(
    `INSERT INTO asset_status_history (asset_id, from_status, to_status, changed_by, reason)
     VALUES ($1,$2,$3,$4,$5)`,
    [asset.id, asset.status, toStatus, actor?.id ?? null, reason ?? null]
  );
  return rows[0];
}
