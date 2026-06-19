import { Server, Socket } from "socket.io";
import { eventBus } from "./eventBus";
import { config } from "../config/index.js";
import { isValidSocketAuth } from "../middlewares/index.js";

// Track which operators are viewing which incident
// Map<incidentId, Set<socketId>>
const incidentViewers = new Map<string, Set<string>>();
// Map<socketId, { incidentId, operatorId }>
const socketMeta      = new Map<string, { incidentId: string; operatorId: string }>();

function addViewer(incidentId: string, socketId: string, operatorId: string) {
  if (!incidentViewers.has(incidentId)) incidentViewers.set(incidentId, new Set());
  incidentViewers.get(incidentId)!.add(socketId);
  socketMeta.set(socketId, { incidentId, operatorId });
}

function removeViewer(socketId: string) {
  const meta = socketMeta.get(socketId);
  if (!meta) return;
  const viewers = incidentViewers.get(meta.incidentId);
  if (viewers) {
    viewers.delete(socketId);
    if (viewers.size === 0) incidentViewers.delete(meta.incidentId);
  }
  socketMeta.delete(socketId);
}

function getViewerCount(incidentId: string): number {
  return incidentViewers.get(incidentId)?.size ?? 0;
}

export function setupSocketHandlers(io: Server) {

  // Reject unauthenticated connections in production when operator key is configured.
  io.use((socket, next) => {
    if (config.env !== "production" || !config.operatorApiKey) {
      return next();
    }
    if (isValidSocketAuth(socket.handshake.auth as { operatorKey?: string; token?: string })) {
      return next();
    }
    return next(new Error("Socket authentication required"));
  });

  // ── Per-client events ──────────────────────────────────────────────────────

  io.on("connection", (socket: Socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on("join:incident", (incidentId: string) => {
      socket.join(`incident:${incidentId}`);
    });

    socket.on("leave:incident", (incidentId: string) => {
      socket.leave(`incident:${incidentId}`);
      removeViewer(socket.id);
      // Broadcast updated presence to the room
      io.to(`incident:${incidentId}`).emit("operator:presence", {
        incidentId,
        viewerCount: getViewerCount(incidentId),
      });
    });

    // Operator announces they are viewing an incident (for presence indicator)
    socket.on("operator:viewing", (data: { incidentId: string; operatorId?: string }) => {
      const { incidentId, operatorId = "anonymous" } = data;

      // Remove from previous incident if switching
      const prev = socketMeta.get(socket.id);
      if (prev && prev.incidentId !== incidentId) {
        removeViewer(socket.id);
        io.to(`incident:${prev.incidentId}`).emit("operator:presence", {
          incidentId:  prev.incidentId,
          viewerCount: getViewerCount(prev.incidentId),
        });
      }

      addViewer(incidentId, socket.id, operatorId);
      socket.join(`incident:${incidentId}`);

      // Broadcast presence to everyone in the room
      io.to(`incident:${incidentId}`).emit("operator:presence", {
        incidentId,
        viewerCount: getViewerCount(incidentId),
        operatorId,
      });
    });

    socket.on("disconnect", () => {
      const meta = socketMeta.get(socket.id);
      if (meta) {
        removeViewer(socket.id);
        io.to(`incident:${meta.incidentId}`).emit("operator:presence", {
          incidentId:  meta.incidentId,
          viewerCount: getViewerCount(meta.incidentId),
        });
      }
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  // ── Global eventBus → Socket.IO bridge ─────────────────────────────────────

  eventBus.on("incident:created", (payload) => {
    io.emit("incident:created", payload.incident ?? payload);
    if (payload.incident?.incidentId) {
      io.to(`incident:${payload.incident.incidentId}`).emit("incident:detail", payload);
    }
    console.log(`[Socket.IO] Broadcast incident:created → ${payload.incident?.incidentId}`);
  });

  eventBus.on("incident:updated", (payload) => {
    io.emit("incident:updated", payload.incident ?? payload);
    if (payload.incident?.incidentId) {
      io.to(`incident:${payload.incident.incidentId}`).emit("incident:detail", payload);
    }
  });

  eventBus.on("incident:retracted", (payload) => {
    io.emit("incident:retracted", { incidentId: payload.incidentId, reason: payload.reason });
    if (payload.incidentId) {
      io.to(`incident:${payload.incidentId}`).emit("incident:retracted", payload);
    }
    console.log(`[Socket.IO] Broadcast incident:retracted → ${payload.incidentId} (${payload.reason})`);
  });

  eventBus.on("resources:updated", (payload) => {
    io.emit("resources:updated", payload);
  });

  eventBus.on("incident:escalated", (payload) => {
    io.emit("incident:updated", payload.incident ?? payload);
    console.log(`[Socket.IO] Broadcast incident:escalated → ${payload.incident?.incidentId}`);
  });
}
