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
    // Task actions go to the portal's REST endpoint with the person's own token.
    userRawCall: createRawCaller({
      baseUrl: new URL('/rest/', config.BITRIX_INBOUND_URL).toString(),
      mode: 'userAction',
      // Two tries fit in the 40 s a person waits (limiter USER_CALL_TIMEOUT_MS).
      timeoutMs: 18_000,
    }),
    ...opts,
  });
  return instance;
}

export async function closeBitrix(): Promise<void> {
  await instance?.close();
  instance = undefined;
}
