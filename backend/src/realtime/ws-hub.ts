import type { WebSocket } from 'ws';
import type { ServerFrame } from '../types/realtime.js';
import { logger } from '../lib/logger.js';

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

  /**
   * Best-effort push. The database is the source of truth; a socket that closes
   * between the readyState check and send() (or whose send() throws) must never
   * fail the caller, whose write has already been committed, nor starve the
   * user's other sockets. A socket that fails is terminated so its 'close'
   * handler runs the normal presence cleanup.
   */
  sendToUser(userId: string, frame: ServerFrame): void {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets || sockets.size === 0) {
      return;
    }
    const json = JSON.stringify(frame);
    // Iterate a snapshot: cleanup triggered by a failing socket mutates the live set.
    for (const socket of [...sockets]) {
      if (socket.readyState !== socket.OPEN) {
        continue;
      }
      try {
        socket.send(json, (err?: Error) => {
          if (err) {
            this.dropBroken(socket);
          }
        });
      } catch (err) {
        logger.warn('ws send failed', { err: err instanceof Error ? err.message : String(err) });
        this.dropBroken(socket);
      }
    }
  }

  private dropBroken(socket: WebSocket): void {
    try {
      socket.terminate();
    } catch {
      // Already gone; nothing else to clean up here.
    }
  }
}

export const wsHub = new WsHub();
