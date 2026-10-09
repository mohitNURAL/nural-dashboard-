// Single entry point for Bitrix24 access in apps/api.
import { config } from '../config';
import { createRawCaller } from './client';
import { createBitrixLimiter, type BitrixLimiter, type LimiterOptions } from './limiter';

export { batch, toQuery, BATCH_LIMIT, type Command, type BatchResult } from './batch';
export { BitrixError, type BitrixResponse, type Params } from './client';
export { listAll } from './listAll';
export type { BitrixLimiter, Call } from './limiter';

let instance: BitrixLimiter | undefined;

export function getBitrix(opts: Pick<LimiterOptions, 'worker'> = {}): BitrixLimiter {
  instance ??= createBitrixLimiter({
    redisUrl: config.REDIS_URL,
    rawCall: createRawCaller({ baseUrl: config.BITRIX_INBOUND_URL }),
    ...opts,
  });
  return instance;
}

export async function closeBitrix(): Promise<void> {
  await instance?.close();
  instance = undefined;
}
