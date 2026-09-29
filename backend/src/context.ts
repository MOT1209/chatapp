/**
 * Application context.
 *
 * The single dependency bundle passed to services and controllers. Injecting it is what
 * lets the same code run against Postgres in production and an in-memory store in tests.
 */

import type { DataStore } from './data/store.js';
import type { Realtime } from './realtime/frames.js';

export interface AppContext {
  store: DataStore;
  realtime: Realtime;
}
