let sequence = 0;

export function createId(prefix: string, now = Date.now()): string {
  sequence = (sequence + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}_${now.toString(36)}_${sequence.toString(36)}`;
}

export function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
