import * as T from "three";
import { surface } from "./art-surface";
import { bevel } from "./environment";
export const mat = (color: number, roughness = 0.9) =>
  [0xdbbda0, 0x367e69, 0x86b49c, 0xbd8860, 0x4b9274, 0xf0f3db].includes(color)
    ? surface(
        color,
        color === 0xdbbda0
          ? "clay"
          : color === 0xbd8860
            ? "wood"
            : color === 0xf0f3db
              ? "paint"
              : "court",
      )
    : new T.MeshStandardMaterial({ color, roughness });
export function box(
  w: number,
  h: number,
  d: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
) {
  const m = bevel(w, h, d, color, 0, 0, 0, h < 0.04 ? 0.003 : 0.045);
  m.material.dispose();
  m.material = mat(color);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
export function sphere(r: number, color: number, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(new T.SphereGeometry(r, 16, 12), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
export function capsule(
  r: number,
  l: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
) {
  const m = new T.Mesh(new T.CapsuleGeometry(r, l, 4, 12), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
export function cylinder(
  r: number,
  h: number,
  color: number,
  x: number,
  y: number,
  z: number,
) {
  const m = new T.Mesh(new T.CylinderGeometry(r, r, h, 12), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
