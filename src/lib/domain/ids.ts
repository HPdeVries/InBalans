/** Random UUID for records and lines. */
export function newLineId(): string {
  return crypto.randomUUID();
}
