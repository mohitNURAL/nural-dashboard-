// Fetches every page of a Bitrix24 list method: the first page directly, the rest in batches.
import { batch, type Command } from './batch';
import type { Params } from './client';
import type { Call } from './limiter';

export const PAGE_SIZE = 50;

export async function listAll<T>(
  call: Call,
  method: string,
  params: Params = {},
  pick: (result: unknown) => T[] = (r) => (r ?? []) as T[],
): Promise<T[]> {
  const first = await call(method, params);
  const items = pick(first.result);
  if (first.next === undefined || first.total === undefined) return items;

  const commands: Record<string, Command> = {};
  for (let start = first.next; start < first.total; start += PAGE_SIZE) {
    commands[`p${start}`] = { method, params: { ...params, start } };
  }
  const rest = await batch(call, commands);
  for (const key of Object.keys(commands)) items.push(...pick(rest.result[key]));
  return items;
}
