/** Until JWT exists, every clock is scoped to this owner. Swap here later. */
export const LOCAL_OWNER_ID = 'local';

export function clockOwnerId(): string {
  return LOCAL_OWNER_ID;
}
