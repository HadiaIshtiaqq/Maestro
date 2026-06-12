import { EventEmitter } from 'events';

// Global bridge between services and Socket.IO
// Services emit here; socketHandlers.ts forwards to connected clients
export const eventBus = new EventEmitter();
eventBus.setMaxListeners(30);
