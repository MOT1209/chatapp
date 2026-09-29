import { describe, it, expect } from 'vitest';
import { ConnectionHub } from '../../src/realtime/hub.js';
import type { WebSocket } from 'ws';

/** Minimal fake socket that records what it was sent. */
function fakeSocket() {
  const sent: string[] = [];
  const socket = {
    OPEN: 1,
    readyState: 1,
    send: (data: string) => sent.push(data),
  } as unknown as WebSocket;
  return { socket, sent };
}

describe('ConnectionHub presence ref-counting', () => {
  it('reports the first and last connection transitions', () => {
    const hub = new ConnectionHub();
    const a = fakeSocket();
    const b = fakeSocket();

    expect(hub.register('u_1', a.socket)).toBe(true); // first
    expect(hub.isOnline('u_1')).toBe(true);
    expect(hub.register('u_1', b.socket)).toBe(false); // second, still online

    expect(hub.unregister('u_1', a.socket)).toBe(false); // one left
    expect(hub.isOnline('u_1')).toBe(true);
    expect(hub.unregister('u_1', b.socket)).toBe(true); // last gone
    expect(hub.isOnline('u_1')).toBe(false);
  });

  it('emits to every socket of the targeted users, once each', () => {
    const hub = new ConnectionHub();
    const a = fakeSocket();
    const b = fakeSocket();
    hub.register('u_1', a.socket);
    hub.register('u_1', b.socket);

    hub.emitToUsers(['u_1', 'u_1'], { type: 'pong', payload: {} });

    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(1);
    expect(JSON.parse(a.sent[0]!)).toEqual({ type: 'pong', payload: {} });
  });

  it('skips users with no live connection', () => {
    const hub = new ConnectionHub();
    expect(() => hub.emitToUsers(['ghost'], { type: 'pong', payload: {} })).not.toThrow();
  });
});
