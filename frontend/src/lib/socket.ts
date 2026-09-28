/**
 * WebSocket client.
 *
 * Speaks the raw JSON protocol from docs/api-contract.md §4. It is deliberately not
 * a state store: it emits frames, and the query layer decides what to do with them.
 * That separation is what lets a page reload rebuild correct state from REST alone.
 *
 * Behaviour worth knowing about:
 *  - Authenticates with an `auth` frame, never a query parameter.
 *  - Reconnects with exponential backoff and jitter, up to a 15s cap.
 *  - Does not reconnect while the tab is hidden, and retries immediately on `online`.
 *  - Misses two heartbeats and forces a reconnect rather than sitting on a dead socket.
 */

import { tokenStore } from "./token-store";
import type {
  ClientFrame,
  ServerFrame,
  ServerFramePayloads,
  ServerFrameType,
  SocketStatus,
} from "./types";

const WS_URL = (import.meta.env.VITE_WS_URL as string | undefined) ?? "ws://localhost:4000/ws";

const PING_INTERVAL_MS = 25_000;
/** Two missed heartbeats means the socket is dead even if close never fires. */
const MAX_MISSED_PONGS = 2;
const BACKOFF_START_MS = 1_000;
const BACKOFF_CAP_MS = 15_000;
/** The server closes unauthenticated sockets after this long. Stay well inside it. */
const AUTH_GRACE_MS = 5_000;

type FrameListener = (frame: ServerFrame) => void;
type StatusListener = (status: SocketStatus) => void;

type PayloadOf<T extends ServerFrameType> = ServerFramePayloads[T];

export class ChatSocket {
  private socket: WebSocket | null = null;
  private status: SocketStatus = "idle";
  private attempt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private missedPongs = 0;
  private authTimer: ReturnType<typeof setTimeout> | null = null;
  /** Frames sent while the socket was down, replayed on the next open. */
  private outbox: ClientFrame[] = [];

  private readonly frameListeners = new Set<FrameListener>();
  private readonly statusListeners = new Set<StatusListener>();

  /** Set false to stop reconnecting, e.g. while signed out. */
  private shouldRun = false;

  getStatus(): SocketStatus {
    return this.status;
  }

  onFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }

  /**
   * Subscribes to a single frame type, receiving its payload.
   *
   * Call sites destructure the payload directly (`({ message }) => …`) rather than
   * unwrapping `frame.payload` every time, which is the only reason the `Extract`
   * gymnastics below are needed.
   */
  on<T extends ServerFrameType>(
    type: T,
    listener: (payload: PayloadOf<T>) => void,
  ): () => void {
    return this.onFrame((frame) => {
      if (frame.type === type) {
        // `frame.type === type` proves the pairing, but TypeScript cannot narrow a
        // union by a generic discriminant, so the correspondence is asserted here.
        listener(frame.payload as PayloadOf<T>);
      }
    });
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  connect(): void {
    this.shouldRun = true;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.open();
  }

  /** Closes the socket and stops all reconnection. */
  disconnect(): void {
    this.shouldRun = false;
    this.attempt = 0;
    this.clearTimers();
    this.outbox = [];

    if (this.socket) {
      // Drop the handlers first so closing does not schedule a reconnect.
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      this.socket.onopen = null;
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close(1000, "client disconnect");
      }
      this.socket = null;
    }
    this.setStatus("closed");
  }

  /** Sends a frame, or queues it until the socket is open. */
  send(frame: ClientFrame): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(frame));
      return;
    }
    // `auth` and `ping` are rebuilt on every connection, so replaying them is pointless.
    if (frame.type === "auth" || frame.type === "ping") {
      return;
    }
    // Cap the queue so a long offline stretch cannot grow without bound.
    this.outbox = [...this.outbox.slice(-49), frame];
  }

  private setStatus(status: SocketStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private open(): void {
    const token = tokenStore.getAccessToken();
    if (!token) {
      // Nothing to authenticate with. Stay closed and let the auth layer start us.
      this.setStatus("closed");
      return;
    }

    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting");

    let socket: WebSocket;
    try {
      socket = new WebSocket(WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    // If the server never accepts the auth frame, drop the socket rather than sit on it.
    this.authTimer = setTimeout(() => {
      if (this.socket === socket && socket.readyState !== WebSocket.OPEN) {
        socket.close(4401, "auth timeout");
      }
    }, AUTH_GRACE_MS);

    socket.onopen = () => {
      this.setStatus("open");
      this.attempt = 0;
      this.missedPongs = 0;
      this.clearTimer("auth");

      this.send({ type: "auth", payload: { token } });
      this.startHeartbeat();
      this.flushOutbox();
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      const frame = this.parse(event.data);
      if (!frame) {
        return;
      }
      if (frame.type === "pong") {
        this.missedPongs = 0;
      }
      for (const listener of this.frameListeners) {
        listener(frame);
      }
    };

    socket.onerror = () => {
      // `close` always follows, and that is where reconnection is scheduled.
    };

    socket.onclose = (event: CloseEvent) => {
      this.clearTimers();
      this.socket = null;

      // 4401 means the token was rejected. Reconnecting with the same token would
      // loop forever, so stop and let the auth layer refresh first.
      if (event.code === 4401) {
        this.shouldRun = false;
        this.setStatus("closed");
        return;
      }
      this.scheduleReconnect();
    };
  }

  private parse(data: unknown): ServerFrame | null {
    if (typeof data !== "string") {
      return null;
    }
    try {
      const parsed = JSON.parse(data) as ServerFrame;
      if (typeof parsed === "object" && parsed !== null && typeof parsed.type === "string") {
        return parsed;
      }
      return null;
    } catch {
      // A malformed frame is the backend's problem. Dropping it keeps the socket alive.
      return null;
    }
  }

  private startHeartbeat(): void {
    this.clearTimer("ping");
    this.pingTimer = setInterval(() => {
      if (this.missedPongs >= MAX_MISSED_PONGS) {
        this.socket?.close(4000, "heartbeat timeout");
        return;
      }
      this.missedPongs += 1;
      this.send({ type: "ping", payload: {} });
    }, PING_INTERVAL_MS);
  }

  private flushOutbox(): void {
    const queued = this.outbox;
    this.outbox = [];
    for (const frame of queued) {
      this.send(frame);
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldRun) {
      this.setStatus("closed");
      return;
    }
    if (typeof document !== "undefined" && document.hidden) {
      // Wait for visibility rather than burning attempts in a background tab.
      this.setStatus("reconnecting");
      return;
    }

    this.attempt += 1;
    const exponential = Math.min(BACKOFF_START_MS * 2 ** (this.attempt - 1), BACKOFF_CAP_MS);
    // Jitter stops many clients from reconnecting in lockstep after an outage.
    const delay = Math.round(exponential * (0.7 + Math.random() * 0.6));

    this.clearTimer("reconnect");
    this.setStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private clearTimers(): void {
    this.clearTimer("ping");
    this.clearTimer("reconnect");
    this.clearTimer("auth");
    this.missedPongs = 0;
  }

  private clearTimer(kind: "ping" | "reconnect" | "auth"): void {
    if (kind === "ping" && this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (kind === "reconnect" && this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (kind === "auth" && this.authTimer) {
      clearTimeout(this.authTimer);
      this.authTimer = null;
    }
  }
}

/** One socket for the whole app. */
export const chatSocket = new ChatSocket();

/* -------------------------------------------------------------------------- */
/*                            Browser event wiring                           */
/* -------------------------------------------------------------------------- */

if (typeof window !== "undefined") {
  // A tab that comes back to the foreground should reconnect immediately.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && chatSocket.getStatus() === "reconnecting") {
      chatSocket.connect();
    }
  });

  // Coming back online is a strong signal the socket is worth retrying now.
  window.addEventListener("online", () => {
    chatSocket.connect();
  });
}
