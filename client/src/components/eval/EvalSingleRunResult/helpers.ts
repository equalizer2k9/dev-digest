/** Duration in seconds with one decimal ("1.8"). */
export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}
