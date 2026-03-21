import type { Server } from "socket.io";

export const PUBLIC_ROOMS_UPDATED_EVENT = "public_rooms_updated";

export function emitPublicRoomsUpdated(io: Server) {
  io.emit(PUBLIC_ROOMS_UPDATED_EVENT);
}