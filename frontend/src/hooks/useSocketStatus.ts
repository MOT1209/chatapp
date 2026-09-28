import { useEffect, useState } from "react";

import { chatSocket } from "@/lib/socket";
import type { SocketStatus } from "@/lib/types";

/**
 * Current WebSocket status, as React state.
 *
 * The socket is a plain class rather than a store, so this bridges its status
 * callback into React. The listener is registered once and cleaned up on unmount.
 */
export function useSocketStatus(): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>(chatSocket.getStatus());

  useEffect(() => chatSocket.onStatus(setStatus), []);

  return status;
}
