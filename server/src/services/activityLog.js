/**
 * Immutable activity trail. Every important mutation calls logActivity
 * with the acting user, the entity, and before/after snapshots.
 * Uses the transaction client when provided so logs commit atomically
 * with the action they describe.
 */
export async function logActivity(client, { actor, action, entityType, entityId = null, previousState = null, newState = null, details = null }) {
  await client.query(
    `INSERT INTO activity_logs (actor_id, actor_role, action, entity_type, entity_id, previous_state, new_state, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [actor?.id ?? null, actor?.role ?? null, action, entityType, entityId,
     previousState ? JSON.stringify(previousState) : null,
     newState ? JSON.stringify(newState) : null,
     details]
  );
}
