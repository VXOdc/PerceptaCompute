/**
 * hungarian.ts — O(n³) Hungarian algorithm for optimal bipartite assignment.
 *
 * Guarantees each detection is assigned to at most one track, and each track
 * to at most one detection — eliminating the identity-swap problem that occurs
 * when two objects of the same type walk close together.
 *
 * Uses the classic Kuhn-Munkres implementation on a rectangular cost matrix.
 * Rows = tracks, Cols = detections. Unmatched slots use INF cost.
 */

export const INF = 1e9;

/**
 * Solve the assignment problem on a cost matrix.
 *
 * @param costMatrix  rows × cols matrix of assignment costs (lower = better).
 *                    May be rectangular; padding to square is handled internally.
 * @returns           Array of length `rows`, where result[i] = j means row i
 *                    is assigned to column j, or -1 if unmatched.
 */
export function hungarianAssign(costMatrix: number[][]): number[] {
  const rows = costMatrix.length;
  if (rows === 0) return [];
  const cols = costMatrix[0].length;
  const n    = Math.max(rows, cols);

  // Pad to square with INF
  const c: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      i < rows && j < cols ? costMatrix[i][j] : INF
    )
  );

  const u   = new Float64Array(n + 1);   // potential for rows
  const v   = new Float64Array(n + 1);   // potential for cols
  const p   = new Int32Array(n + 1);     // col → row assignment
  const way = new Int32Array(n + 1);     // prev col in augmenting path

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minVal = new Float64Array(n + 1).fill(INF);
    const used   = new Uint8Array(n + 1);

    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = INF;
      let j1 = -1;

      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = c[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minVal[j]) {
          minVal[j] = cur;
          way[j] = j0;
        }
        if (minVal[j] < delta) {
          delta = minVal[j];
          j1 = j;
        }
      }

      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else          { minVal[j] -= delta; }
      }

      j0 = j1!;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  // Extract assignments for original rows only
  const result = new Array<number>(rows).fill(-1);
  for (let j = 1; j <= n; j++) {
    const i = p[j];
    if (i >= 1 && i <= rows && j <= cols) {
      result[i - 1] = j - 1;
    }
  }
  return result;
}
