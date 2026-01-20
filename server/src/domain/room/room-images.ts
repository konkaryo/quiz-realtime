import fs from "fs";
import path from "path";
import { CFG } from "../../config";

let cachedImages: string[] | null = null;

function loadInterfaceImages() {
  const interfaceDir = path.resolve(CFG.IMG_DIR, "interface");
  if (!fs.existsSync(interfaceDir)) return [];

  return fs
    .readdirSync(interfaceDir)
    .filter((file) => file.toLowerCase().endsWith(".avif"))
    .map((file) => path.parse(file).name)
    .sort();
}

export function getInterfaceImages() {
  if (!cachedImages) {
    cachedImages = loadInterfaceImages();
  }
  return cachedImages;
}

function hashRoomId(roomId: string) {
  let hash = 0;
  for (let i = 0; i < roomId.length; i += 1) {
    hash = (hash * 31 + roomId.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function resolveRoomImage(roomId: string, images: string[]) {
  if (images.length === 0) return null;
  const index = hashRoomId(roomId) % images.length;
  return images[index];
}