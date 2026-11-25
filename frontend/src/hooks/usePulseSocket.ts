import { useCallback, useEffect, useRef, useState } from 'react';
import { getDeviceName, getServerUrl, getToken, resolveWsUrl } from '../lib/api';
import { isNativeApp } from '../lib/native';
import type { WsEnvelope } from '../types/api';

export type WsStatus = 'disconnected' | 'connecting' | 'connected';

interface UsePulseSocketOptions {
  enabled: boolean;
  onEvent: (event: WsEnvelope) => void;
  onReconnect?: () => void;
}

export function usePulseSocket({
  enabled,
  onEvent,
  onReconnect,
}: UsePulseSocketOptions): {
  wsStatus: WsStatus;
  reconnectNow: () => void;
} {
  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected');
  const onEventRef = useRef(onEvent);
  const onReconnectRef = useRef(onReconnect);
  onEventRef.current = onEvent;
  onReconnectRef.current = onReconnect;

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<number | null>(null);
  const pingRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const hasConnectedOnceRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const cleanupTimers = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pingRef.current !== null) {
      window.clearInterval(pingRef.current);
      pingRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    cleanupTimers();
    if (!enabledRef.current) {
      setWsStatus('disconnected');
      return;
    }

    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (isNativeApp() && !getServerUrl()) {
      setWsStatus('disconnected');
      return;
    }

    const token = getToken() || '';
    const device = getDeviceName();
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (device) params.set('device', device);
    const url = resolveWsUrl(params);

    setWsStatus('connecting');
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        setWsStatus('connected');
        if (hasConnectedOnceRef.current) {
          onReconnectRef.current?.();
        }
        hasConnectedOnceRef.current = true;

        // Lightweight keepalive ping for mobile proxies / tunnels
        pingRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
            } catch {
              // Ignore
            }
          }
        }, 25000);
      };

      ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(String(msg.data)) as WsEnvelope;
          if (parsed && typeof parsed.type === 'string') {
            onEventRef.current(parsed);
          }
        } catch {
          // Ignore malformed WS payloads
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        cleanupTimers();
        if (!enabledRef.current) {
          setWsStatus('disconnected');
          return;
        }
        setWsStatus('disconnected');
        const delay = Math.min(10000, 1000 * Math.pow(1.6, attemptRef.current));
        attemptRef.current += 1;
        timerRef.current = window.setTimeout(() => {
          connect();
        }, delay);
      };

      ws.onerror = () => {
        // onclose will handle backoff reconnect
      };
    } catch {
      setWsStatus('disconnected');
      timerRef.current = window.setTimeout(connect, 2500);
    }
  }, [cleanupTimers]);

  const reconnectNow = useCallback(() => {
    attemptRef.current = 0;
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore
      }
      wsRef.current = null;
    }
    connect();
  }, [connect]);

  useEffect(() => {
    if (!enabled) {
      cleanupTimers();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // Ignore
        }
        wsRef.current = null;
      }
      setWsStatus('disconnected');
      return;
    }

    connect();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && enabledRef.current) {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          attemptRef.current = 0;
          connect();
        } else {
          onReconnectRef.current?.();
        }
      }
    };

    const handleOnline = () => {
      if (enabledRef.current) {
        attemptRef.current = 0;
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      cleanupTimers();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // Ignore
        }
        wsRef.current = null;
      }
    };
  }, [enabled, connect, cleanupTimers]);

  return { wsStatus, reconnectNow };
}
