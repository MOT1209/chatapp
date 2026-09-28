import type { WebSocket } from 'ws';
import type { ServerFrame } from '../types/realtime.js';

/**
 * In-process registry of live sockets per user.
 *
 * Alpha runs a single backend instance, so an in-memory map is sufficient. Scaling
 * to multiple instances would need a shared pub/sub (Redis) behind this same
 * interface — deliberately deferred past v0.0.1.
 */
class WsHub {
  private readonly socketsByUser = new Map<string, Set<WebSocket>>();

  /** Registers a socket. Returns true if this is the user's first connection. */
  add(userId: string, socket: WebSocket): boolean {
    let sockets = this.socketsByUser.get(userId);
    const wasOffline = !sockets || sockets.size === 0;
    if (!sockets) {
      sockets = new Set();
      this.socketsByUser.set(userId, sockets);
    }
    sockets.add(socket);
    return wasOffline;
  }

  /** Unregisters a socket. Returns true if the user has no connections left. */
  remove(userId: string, socket: WebSocket): boolean {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) {
      return true;
    }
    sockets.delete(socket);
    if (sockets.size === 0) {
      this.socketsByUser.delete(userId);
      return true;
    }
    return false;
  }

  isOnline(userId: string): boolean {
    return this.socketsByUser.has(userId);
  }

  sendToUser(userId: string, frame: ServerFrame): void {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets || sockets.size === 0) {
      return;
    }
    const json = JSON.stringify(frame);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(json);
      }
    }
  }
}

export const wsHub = new WsHub();
