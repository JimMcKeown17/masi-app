import type { ItemSetMeta } from '../types/ItemSet';

export function resolveItemSet<T extends ItemSetMeta>(
  language: string,
  override: unknown,
  bundled: Partial<Record<string, T>>,
  isValid: (v: unknown) => v is T,
): T | null {
  if (isValid(override)) return override;
  return bundled[language] ?? null;
}
