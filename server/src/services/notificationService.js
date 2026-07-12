import { ROLES } from '../constants/roles.js';

/** Insert a notification for one user. */
export async function notifyUser(client, userId, { type, title, message, link = null }) {
  if (!userId) return;
  await client.query(
    `INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,$2,$3,$4,$5)`,
    [userId, type, title, message, link]
  );
}

/** Insert the same notification for every active user holding one of the given roles. */
export async function notifyRoles(client, roles, { type, title, message, link = null }) {
  await client.query(
    `INSERT INTO notifications (user_id, type, title, message, link)
     SELECT id, $2, $3, $4, $5 FROM users WHERE role = ANY($1) AND is_active`,
    [roles, type, title, message, link]
  );
}

/** Managers (Admin + Asset Manager) get operational alerts. */
export const notifyManagers = (client, payload) =>
  notifyRoles(client, [ROLES.ADMIN, ROLES.ASSET_MANAGER], payload);
