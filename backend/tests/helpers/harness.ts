/**
 * Test harness.
 *
 * Builds an app over the in-memory store, and (for realtime tests) a live HTTP + WS
 * server on an ephemeral port. Also small helpers for registering users and driving a
 * WebSocket client with promise-based frame waiting.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import request from 'supertest';
import { WebSocket, type WebSocketServer } from 'ws';
import { createApp } from '../../src/app.js';
import type { AppContext } from '../../src/context.js';
import { MemoryStore } from '../../src/data/memory-store.js';
import { ConnectionHub } from '../../src/realtime/hub.js';
import { attachRealtime } from '../../src/realtime/server.js';

export interface Harness {
  app: Express;
  ctx: AppContext;
  store: MemoryStore;
  hub: ConnectionHub;
}

export function makeApp(): Harness {
  const store = new MemoryStore();
  const hub = new ConnectionHub();
  const ctx: AppContext = { store, realtime: hub };
  return { app: createApp(ctx), ctx, store, hub };
}

export interface LiveServer extends Harness {
  server: Server;
  wsUrl: string;
  close: () => Promise<void>;
}

export async function startLiveServer(): Promise<LiveServer> {
  const harness = makeApp();
  const server = createServer(harness.app);
  const wss: WebSocketServer = attachRealtime(server, harness.ctx, harness.hub);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    ...harness,
    server,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    close: () =>
      new Promise<void>((resolve) => {
        // Terminate any lingering sockets so server.close does not hang on them.
        for (const client of wss.clients) client.terminate();
        wss.close(() => {
          server.close(() => resolve());
        });
      }),
  };
}

export interface RegisteredUser {
  user: { id: string; username: string; email: string; displayName: string };
  accessToken: string;
  refreshToken: string;
}

let counter = 0;

export async function registerUser(app: Express, overrides: Partial<{ username: string; email: string; password: string; displayName: string }> = {}): Promise<RegisteredUser> {
  counter += 1;
  const body = {
    username: overrides.username ?? `user${counter}`,
    email: overrides.email ?? `user${counter}@example.com`,
    password: overrides.password ?? 'correct-horse-battery',
    displayName: overrides.displayName ?? `User ${counter}`,
  };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as RegisteredUser;
}

/* --------------------------- WebSocket test client --------------------------- */

export interface WsFrame {
  type: string;
  payload: unknown;
}

export class TestSocket {
  private readonly ws: WebSocket;
  /** Frames that have arrived but not yet been consumed by a waitFor. */
  private readonly buffer: WsFrame[] = [];
  private readonly waiters: { predicate: (f: WsFrame) => boolean; resolve: (f: WsFrame) => void }[] = [];
  closeCode: number | null = null;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on('message', (data) => {
      const frame = JSON.parse(data.toString()) as WsFrame;
      // A waiting reader consumes the frame directly; otherwise buffer it.
      const idx = this.waiters.findIndex((w) => w.predicate(frame));
      if (idx !== -1) {
        const [waiter] = this.waiters.splice(idx, 1);
        waiter!.resolve(frame);
      } else {
        this.buffer.push(frame);
      }
    });
    ws.on('close', (code) => {
      this.closeCode = code;
    });
  }

  static async open(wsUrl: string): Promise<TestSocket> {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    return new TestSocket(ws);
  }

  send(frame: WsFrame): void {
    this.ws.send(JSON.stringify(frame));
  }

  /** Sends a raw string, for malformed-frame tests. */
  sendRaw(text: string): void {
    this.ws.send(text);
  }

  /** Waits for and consumes the next unread frame of `type`. */
  waitFor(type: string, timeoutMs = 2000): Promise<WsFrame> {
    const idx = this.buffer.findIndex((f) => f.type === type);
    if (idx !== -1) {
      const [frame] = this.buffer.splice(idx, 1);
      return Promise.resolve(frame!);
    }
    return new Promise<WsFrame>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for frame "${type}"`)), timeoutMs);
      this.waiters.push({
        predicate: (f) => f.type === type,
        resolve: (f) => {
          clearTimeout(timer);
          resolve(f);
        },
      });
    });
  }

  async waitForClose(timeoutMs = 6000): Promise<number> {
    if (this.closeCode !== null) return this.closeCode;
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for close')), timeoutMs);
      this.ws.once('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  }

  close(): void {
    this.ws.close();
  }
}
