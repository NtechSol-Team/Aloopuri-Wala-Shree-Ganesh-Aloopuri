import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth.store';
import { socketOrigin } from '@/lib/api-origin';

let socket: Socket | null = null;

/** Lazily create (or return) the authenticated Socket.IO connection. */
export function getSocket(): Socket | null {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  if (socket?.connected) return socket;

  socket = io(socketOrigin(), {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
