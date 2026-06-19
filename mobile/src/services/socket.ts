import { io, Socket } from 'socket.io-client';
import { BASE_URL } from './api';
import { getToken } from './auth';

let socket: Socket | null = null;

export async function getSocket(): Promise<Socket> {
  if (!socket) {
    const token = await getToken();
    socket = io(BASE_URL, {
      transports: ['websocket'],
      auth: token ? { token } : {},
    });
    socket.on('connect_error', (err) => {
      console.warn('[Socket] connect_error:', err.message);
    });
    socket.on('disconnect', (reason) => {
      console.warn('[Socket] disconnected:', reason);
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
