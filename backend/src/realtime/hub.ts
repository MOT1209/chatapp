/**
 * Connection hub.
 *
 * Tracks every open socket per user and implements the `Realtime` interface the
 * services push through. Presence is reference-counted: a user is online while they
 * hold at least one socket, so closing one of several tabs does not flip them offline.
 */

import type { WebSocket } from 'ws';
import type { Realtime, ServerFrame } from './frames.js';

export class ConnectionHub implements Realtime {
  private readonly connections = new Map<string, Set<WebSocket>>();

  /** Adds a socket. Returns true when this is the user's first live connection. */
  register(userId: string, socket: WebSocket): boolean {
    let set = this.connections.get(userId);
    const firstConnection = !set || set.size === 0;
    if (!set) {
      set = new Set();
      this.connections.set(userId, set);
    }
    set.add(socket);
    return firstConnection;
  }

  /** Removes a socket. Returns true when the user has no remaining connections. */
  unregister(userId: string, socket: WebSocket): boolean {
    const set = this.connections.get(userId);
    if (!set) return false;
    set.delete(socket);
    if (set.size === 0) {
      this.connections.delete(userId);
      return true;
    }
    return false;
  }

  isOnline(userId: string): boolean {
    return (this.connections.get(userId)?.size ?? 0) > 0;
  }

  emitToUsers(userIds: Iterable<string>, frame: ServerFrame): void {
    const data = JSON.stringify(frame);
    const delivered = new Set<WebSocket>();
    for (const userId of userIds) {
      const set = this.connections.get(userId);
      if (!set) continue;
      for (const socket of set) {
        // A user id may repeat across calls; never send the same frame twice to a socket.
        if (delivered.has(socket)) continue;
        delivered.add(socket);
        if (socket.readyState === socket.OPEN) {
          socket.send(data);
        }
      }
    }
  }
}
