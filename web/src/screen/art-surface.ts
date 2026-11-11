import * as T from "three";
import { ART, TILEABLE } from "../art-assets";
export const assets = ART as Record<string, { file: string }>;
const textures = new Map<string, T.Texture>();
export function surface(color: number, key: string): T.MeshStandardMaterial {
  const material = new T.MeshStandardMaterial({ color, roughness: 1 });
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 128, 128);
  let seed = 73;
  for (let i = 0; i < 2200; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    ctx.fillStyle = i % 2 ? "#dfe2d7" : "#f0eee2";
    ctx.fillRect(seed % 128, (seed >>> 8) % 128, 1, 1);
  }
  const grain = new T.CanvasTexture(canvas);
  grain.wrapS = grain.wrapT = T.RepeatWrapping;
  grain.repeat.set(4, 4);
  grain.colorSpace = T.SRGBColorSpace;
  material.map = grain;
  if (assets[key] && (TILEABLE as readonly string[]).includes(key)) {
    let texture = textures.get(key);
    if (!texture) {
      texture = new T.TextureLoader().load(assets[key].file);
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.repeat.set(4, 6);
      texture.colorSpace = T.SRGBColorSpace;
      textures.set(key, texture);
    }
    grain.dispose();
    material.map = texture;
    material.color.setHex(0xffffff);
  }
  return material;
}
