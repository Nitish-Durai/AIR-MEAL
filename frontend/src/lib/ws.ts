import { useEffect, useRef } from "react";

/**
 * Custom hook to listen to real-time status updates for a specific flight's orders.
 * Automatically manages socket opening, parsing, reconnecting, and closing.
 */
export function useOrderSocket(
  flightId: string | null | undefined,
  token: string | null | undefined,
  onEvent: (event: string, data: any) => void
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!flightId || !token) return;

    let socket: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isClosedIntentional = false;

    function connect() {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      // Convert http:// or https:// to ws:// or wss://
      const wsBase = apiBase.replace(/^http/, "ws");
      const wsUrl = `${wsBase}/ws?token=${encodeURIComponent(token || "")}&flight_id=${encodeURIComponent(flightId || "")}`;

      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.event) {
            onEventRef.current(payload.event, payload.data);
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      };

      socket.onclose = (e) => {
        if (!isClosedIntentional) {
          reconnectTimeout = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      socket.onerror = (err) => {
        // Downgraded to warn — connection failures are transient and don't warrant
        // surfacing as a hard error in the Next.js dev overlay.
        console.warn("WebSocket connection failed (will retry):", err);
      };
    }

    connect();

    return () => {
      isClosedIntentional = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socket) {
        socket.close();
      }
    };
  }, [flightId, token]);
}
