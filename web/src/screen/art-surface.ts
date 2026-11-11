import * as T from "three";
import { ART, TILEABLE } from "../art-assets";
export const assets = ART as Record<string, { file: string }>;
const textures = new Map<string, T.Texture>();
const grains = new Map<string, T.CanvasTexture>();
export function surface(color: number, key: string): T.MeshStandardMaterial {
  const material = new T.MeshStandardMaterial({ color, roughness: 1 });
  let grain = grains.get(key);
  if (!grain) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f5f4ee";
    ctx.fillRect(0, 0, 128, 128);
    let seed = 73;
    for (let i = 0; i < 4500; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      ctx.fillStyle = i % 2 ? "#c9cfc2" : "#e9e8dc";
      ctx.globalAlpha = key === "paint" ? 0.45 : 0.18;
      ctx.fillRect(seed % 128, (seed >>> 8) % 128, key === "paint" ? 2 : 1, 1);
    }
    ctx.globalAlpha = 1;
    grain = new T.CanvasTexture(canvas);
    grain.wrapS = grain.wrapT = T.RepeatWrapping;
    grain.repeat.set(key === "paint" ? 2 : 8, key === "paint" ? 2 : 12);
    // Deliberately linear: this texture also drives microscopic roughness/bump.
    grains.set(key, grain);
  }
  material.map = grain;
  material.roughnessMap = grain;
  material.bumpMap = grain;
  material.bumpScale = key === "paint" ? 0.001 : 0.008;
  if (
    key === "wood" &&
    assets[key] &&
    (TILEABLE as readonly string[]).includes(key)
  ) {
    let texture = textures.get(key);
    if (!texture) {
      texture = new T.TextureLoader().load(assets[key].file);
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.repeat.set(4, 6);
      texture.colorSpace = T.SRGBColorSpace;
      textures.set(key, texture);
    }
    material.map = texture;
    material.color.setHex(0xffffff);
  }
  return material;
}

export function disposeSurfaceTextures() {
  for (const texture of textures.values()) texture.dispose();
  for (const texture of grains.values()) texture.dispose();
  textures.clear();
  grains.clear();
}
