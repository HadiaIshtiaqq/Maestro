import { io, Socket } from 'socket.io-client';
import { BASE_URL } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(BASE_URL, { transports: ['websocket'] });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
