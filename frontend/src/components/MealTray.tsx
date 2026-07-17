"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface TrayItem {
  meal_name: string | null;
  meal_code: string | null;
  category_name: string | null;
  is_alcohol: boolean;
  qty: number;
}

type Slot = "starter" | "main" | "dessert" | "drink" | "snack";
type Shape = "bowl" | "flat" | "stack" | "strands" | "pieces" | "cup" | "pouch";

const CODE_PREFIX: Record<string, Slot> = {
  ST: "starter",
  MC: "main",
  DS: "dessert",
  BV: "drink",
  SN: "snack",
  AL: "drink",
};

function slotOf(item: TrayItem): Slot | null {
  if (item.is_alcohol) return "drink";
  const prefix = (item.meal_code || "").slice(0, 2).toUpperCase();
  if (CODE_PREFIX[prefix]) return CODE_PREFIX[prefix];
  switch (item.category_name) {
    case "Starters":
      return "starter";
    case "Main Course":
      return "main";
    case "Desserts":
      return "dessert";
    case "Beverages":
      return "drink";
    case "Snacks":
      return "snack";
  }
  return null;
}

const DISHES: Record<string, { shape: Shape; color: number; accent?: number }> = {
  ST001: { shape: "bowl", color: 0xc4452d },
  ST002: { shape: "bowl", color: 0xa8763a, accent: 0x4a7c3f },
  ST003: { shape: "flat", color: 0xd8b070, accent: 0xd9a55c },
  ST004: { shape: "pieces", color: 0xc75b28 },
  ST005: { shape: "pieces", color: 0xd9a55c },
  ST006: { shape: "flat", color: 0x7fa84c, accent: 0xf4efe0 },
  ST007: { shape: "flat", color: 0x6f9e3f, accent: 0xe8735f },
  ST008: { shape: "pieces", color: 0x84b04a },
  MC001: { shape: "bowl", color: 0xc75b28 },
  MC002: { shape: "bowl", color: 0xe0b055 },
  MC003: { shape: "bowl", color: 0xd9a441 },
  MC004: { shape: "bowl", color: 0xcf6a35, accent: 0xf0e8d0 },
  MC005: { shape: "flat", color: 0x8a4b2a },
  MC006: { shape: "flat", color: 0xe8735f },
  MC007: { shape: "pieces", color: 0xdcae63 },
  MC008: { shape: "strands", color: 0xe3cf9e, accent: 0x6f9e3f },
  MC009: { shape: "flat", color: 0xb5763c, accent: 0x7fa84c },
  MC010: { shape: "pieces", color: 0x8f5230, accent: 0xe0cf9e },
  MC011: { shape: "pieces", color: 0x9c8f3c, accent: 0xd8b070 },
  MC012: { shape: "bowl", color: 0xb85a2a, accent: 0x5f8a3a },
  MC013: { shape: "pieces", color: 0xefe6d2 },
  MC014: { shape: "strands", color: 0xd99a4e, accent: 0x7fa84c },
  MC015: { shape: "bowl", color: 0x7f9c52 },
  MC016: { shape: "stack", color: 0x8a4b2a, accent: 0xd9a55c },
  DS001: { shape: "pieces", color: 0xa85f24 },
  DS002: { shape: "bowl", color: 0xe8a83c },
  DS003: { shape: "stack", color: 0x8a5a3a, accent: 0xf4ead6 },
  DS004: { shape: "pieces", color: 0xc99a4a },
  DS005: { shape: "pieces", color: 0xe8c4d8 },
  DS006: { shape: "bowl", color: 0xd45a72, accent: 0x7fa84c },
  DS007: { shape: "stack", color: 0x4a2c1f, accent: 0xf4ead6 },
  DS008: { shape: "stack", color: 0xf4ead6, accent: 0xa8283f },
  DS009: { shape: "stack", color: 0xf0e2c0, accent: 0xd45a72 },
  DS010: { shape: "bowl", color: 0xe8cf95, accent: 0xb5702c },
  DS011: { shape: "bowl", color: 0xe89bb0 },
  DS012: { shape: "stack", color: 0xd9a55c, accent: 0xe0cf9e },
  BV001: { shape: "cup", color: 0xa87a52 },
  BV002: { shape: "cup", color: 0xa8c17a },
  BV003: { shape: "cup", color: 0xe89b3c },
  BV004: { shape: "cup", color: 0xc9e4f2 },
  BV005: { shape: "cup", color: 0x3a2118 },
  BV006: { shape: "cup", color: 0x4a2c1a },
  BV007: { shape: "cup", color: 0xd8ecc8 },
  BV008: { shape: "cup", color: 0xb08a5e },
  BV009: { shape: "cup", color: 0xd9b34a },
  BV010: { shape: "cup", color: 0xd8eef8 },
  AL001: { shape: "cup", color: 0x6e2032 },
  AL002: { shape: "cup", color: 0xe6dfa8 },
  AL003: { shape: "cup", color: 0xd9a441 },
  AL004: { shape: "cup", color: 0xa8642a },
  AL005: { shape: "cup", color: 0xe8eef2 },
  SN001: { shape: "pouch", color: 0x9c6b3f },
  SN002: { shape: "pouch", color: 0xc99a52 },
  SN003: { shape: "pouch", color: 0xe8cf85 },
  SN004: { shape: "pouch", color: 0xb5702c },
  SN005: { shape: "pouch", color: 0x7a4a2a },
  SN006: { shape: "bowl", color: 0xd45a72 },
  SN007: { shape: "pouch", color: 0xf0e6cc },
  SN008: { shape: "flat", color: 0xd8b070, accent: 0x7fa84c },
  SN009: { shape: "bowl", color: 0xf0e8dc, accent: 0xd45a72 },
  SN010: { shape: "pouch", color: 0xd4a04e },
};

const SLOT_DEFAULT: Record<Slot, { shape: Shape; color: number }> = {
  starter: { shape: "bowl", color: 0xd98f4e },
  main: { shape: "bowl", color: 0xc2571f },
  dessert: { shape: "stack", color: 0xd9a3c4 },
  drink: { shape: "cup", color: 0xb9d8e8 },
  snack: { shape: "pouch", color: 0xd4b483 },
};

function dishOf(code: string | null, slot: Slot) {
  const d = code ? DISHES[code.toUpperCase()] : undefined;
  return d ?? SLOT_DEFAULT[slot];
}

function makeLabelSprite(text: string): THREE.Sprite {
  const pad = 16;
  const cvs = document.createElement("canvas");
  const ctx = cvs.getContext("2d")!;
  const font = "600 30px Inter, system-ui, sans-serif";
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width + pad * 2);
  const h = 54;
  cvs.width = w;
  cvs.height = h;

  ctx.fillStyle = "rgba(12,22,36,0.88)";
  const r = 12;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  ctx.textBaseline = "top";
  ctx.font = font;
  ctx.fillStyle = "#F2F7FC";
  ctx.fillText(text, pad, 14);

  const tex = new THREE.CanvasTexture(cvs);
  tex.needsUpdate = true;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
  );
  const scale = 0.004;
  sprite.scale.set(w * scale, h * scale, 1);
  sprite.renderOrder = 10;
  return sprite;
}

const MAX_PER_ZONE = 4;

export default function MealTray({ items }: { items: TrayItem[] }) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = 380;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    camera.position.set(0, 5.2, 5.9);
    camera.lookAt(0, -0.55, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(3.5, 7, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9ec7f0, 0.4);
    fill.position.set(-4, 3, -3);
    scene.add(fill);

    const group = new THREE.Group();
    scene.add(group);

    group.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(4.6, 0.18, 3.2),
        new THREE.MeshStandardMaterial({
          color: 0xe8e2d6,
          roughness: 0.62,
          metalness: 0.04,
        })
      )
    );

    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.12, 3.4),
      new THREE.MeshStandardMaterial({
        color: 0x5a6472,
        roughness: 0.5,
        metalness: 0.25,
      })
    );
    lip.position.y = -0.08;
    group.add(lip);

    const placemat = new THREE.Mesh(
      new THREE.BoxGeometry(4.3, 0.02, 2.9),
      new THREE.MeshStandardMaterial({ color: 0xd8cfbe, roughness: 0.95 })
    );
    placemat.position.y = 0.1;
    group.add(placemat);

    const positions: Record<Slot, [number, number]> = {
      main: [-0.7, 0.35],
      starter: [-1.75, -0.95],
      dessert: [1.5, -1.0],
      drink: [1.35, 0.5],
      snack: [-0.2, -1.05],
    };

    const zoneOffsets: [number, number][] = [
      [0, 0],
      [0.72, 0],
      [0, 0.68],
      [0.72, 0.68],
    ];

    const dishMat = new THREE.MeshStandardMaterial({
      color: 0xfbfcfd,
      roughness: 0.35,
    });
    const recessMat = new THREE.MeshStandardMaterial({
      color: 0xcfc6b4,
      roughness: 0.95,
    });

    const chosen = new Map<Slot, { name: string; code: string | null; qty: number }[]>();
    for (const item of items) {
      const s = slotOf(item);
      if (!s) continue;
      const list = chosen.get(s) ?? [];
      const name = item.meal_name || "Item";
      const existing = list.find(e => e.name === name);
      if (existing) existing.qty += item.qty;
      else list.push({ name, code: item.meal_code, qty: item.qty });
      chosen.set(s, list);
    }

    (["main", "starter", "dessert"] as Slot[]).forEach(slot => {
      const [x, z] = positions[slot];
      const r = slot === "main" ? 0.95 : 0.5;
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 0.92, 0.1, 32),
        recessMat
      );
      m.position.set(x, 0.06, z);
      group.add(m);
    });

    const sprites: THREE.Sprite[] = [];
    const mat = (c: number, rough = 0.55) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: rough });

    const buildBowl = (x: number, z: number, s: number, color: number, accent?: number) => {
      const bowl = new THREE.Mesh(
        new THREE.SphereGeometry(0.48 * s, 30, 18, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
        dishMat
      );
      bowl.position.set(x, 0.44 * s + 0.1, z);
      group.add(bowl);
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.47 * s, 0.03, 10, 40),
        dishMat
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.set(x, 0.44 * s + 0.1, z);
      group.add(rim);
      const food = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4 * s, 0.4 * s, 0.06, 32),
        mat(color, 0.45)
      );
      food.position.set(x, 0.33 * s + 0.1, z);
      group.add(food);
      if (accent) {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          const g = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 12, 10), mat(accent));
          g.position.set(
            x + Math.cos(a) * 0.18 * s,
            0.37 * s + 0.1,
            z + Math.sin(a) * 0.18 * s
          );
          group.add(g);
        }
      }
    };

    const buildFlat = (x: number, z: number, s: number, color: number, accent?: number) => {
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.52 * s, 0.48 * s, 0.07, 40),
        dishMat
      );
      plate.position.set(x, 0.14, z);
      group.add(plate);
      for (let i = 0; i < 4; i++) {
        const slice = new THREE.Mesh(
          new THREE.BoxGeometry(0.3 * s, 0.06, 0.13 * s),
          mat(color, 0.4)
        );
        slice.position.set(x - 0.14 * s + i * 0.09 * s, 0.21, z - 0.1 * s + i * 0.07 * s);
        slice.rotation.y = 0.3;
        slice.rotation.z = 0.12;
        group.add(slice);
      }
      if (accent) {
        for (let i = 0; i < 3; i++) {
          const g = new THREE.Mesh(new THREE.SphereGeometry(0.055 * s, 12, 10), mat(accent));
          g.position.set(x + 0.18 * s, 0.2, z - 0.22 * s + i * 0.11 * s);
          group.add(g);
        }
      }
    };

    const buildStack = (x: number, z: number, s: number, color: number, accent?: number) => {
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.48 * s, 0.44 * s, 0.07, 34),
        dishMat
      );
      plate.position.set(x, 0.14, z);
      group.add(plate);
      const layers = [color, accent ?? color, color];
      layers.forEach((c, i) => {
        const layer = new THREE.Mesh(
          new THREE.CylinderGeometry(0.29 * s, 0.3 * s, 0.09, 30),
          mat(c, 0.6)
        );
        layer.position.set(x, 0.22 + i * 0.095, z);
        group.add(layer);
      });
      const top = new THREE.Mesh(
        new THREE.SphereGeometry(0.06 * s, 14, 12),
        mat(accent ?? 0xa8283f, 0.5)
      );
      top.position.set(x, 0.52, z);
      group.add(top);
    };

    const buildStrands = (x: number, z: number, s: number, color: number, accent?: number) => {
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.52 * s, 0.48 * s, 0.07, 40),
        dishMat
      );
      plate.position.set(x, 0.14, z);
      group.add(plate);
      const nest = new THREE.Mesh(
        new THREE.TorusGeometry(0.22 * s, 0.1 * s, 12, 30),
        mat(color, 0.65)
      );
      nest.rotation.x = Math.PI / 2;
      nest.position.set(x, 0.24, z);
      group.add(nest);
      const nest2 = new THREE.Mesh(
        new THREE.TorusGeometry(0.13 * s, 0.08 * s, 12, 26),
        mat(color, 0.65)
      );
      nest2.rotation.x = Math.PI / 2;
      nest2.position.set(x, 0.3, z);
      group.add(nest2);
      if (accent) {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.5;
          const g = new THREE.Mesh(new THREE.SphereGeometry(0.055 * s, 12, 10), mat(accent));
          g.position.set(x + Math.cos(a) * 0.26 * s, 0.24, z + Math.sin(a) * 0.26 * s);
          group.add(g);
        }
      }
    };

    const buildPieces = (x: number, z: number, s: number, color: number, accent?: number) => {
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.52 * s, 0.48 * s, 0.07, 40),
        dishMat
      );
      plate.position.set(x, 0.14, z);
      group.add(plate);
      const spots: [number, number][] = [
        [-0.16, -0.14],
        [0.17, -0.12],
        [-0.13, 0.17],
        [0.16, 0.16],
        [0, 0.02],
      ];
      spots.forEach(([ox, oz], i) => {
        const p = new THREE.Mesh(
          new THREE.SphereGeometry(0.11 * s, 16, 12),
          mat(i === 4 && accent ? accent : color, 0.55)
        );
        p.scale.y = 0.8;
        p.position.set(x + ox * s, 0.24, z + oz * s);
        group.add(p);
      });
    };

    const buildCup = (x: number, z: number, color: number) => {
      const holder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.28, 0.08, 30),
        recessMat
      );
      holder.position.set(x, 0.06, z);
      group.add(holder);
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.27, 0.19, 0.7, 30, 1, true),
        new THREE.MeshStandardMaterial({
          color: 0xeef4f9,
          roughness: 0.18,
          metalness: 0.05,
          transparent: true,
          opacity: 0.45,
          side: THREE.DoubleSide,
        })
      );
      cup.position.set(x, 0.46, z);
      group.add(cup);
      const liquid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.21, 0.16, 0.4, 30),
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.3,
          transparent: true,
          opacity: 0.9,
        })
      );
      liquid.position.set(x, 0.34, z);
      group.add(liquid);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 0.03, 30),
        dishMat
      );
      base.position.set(x, 0.13, z);
      group.add(base);
    };

    const buildPouch = (x: number, z: number, color: number) => {
      const pouch = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.18, 0.38),
        mat(color)
      );
      pouch.position.set(x, 0.19, z);
      pouch.rotation.y = 0.28;
      group.add(pouch);
      const seal = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.03, 0.07),
        mat(0xe8edf2, 0.6)
      );
      seal.position.set(x, 0.29, z);
      seal.rotation.y = 0.28;
      group.add(seal);
    };

    const buildShape = (
      shape: Shape,
      x: number,
      z: number,
      s: number,
      color: number,
      accent?: number
    ) => {
      if (shape === "bowl") buildBowl(x, z, s, color, accent);
      else if (shape === "flat") buildFlat(x, z, s, color, accent);
      else if (shape === "stack") buildStack(x, z, s, color, accent);
      else if (shape === "strands") buildStrands(x, z, s, color, accent);
      else if (shape === "pieces") buildPieces(x, z, s, color, accent);
      else if (shape === "cup") buildCup(x, z, color);
      else buildPouch(x, z, color);
    };

    chosen.forEach((entries, slot) => {
      const [x, z] = positions[slot];

      if (slot === "drink" || slot === "snack") {
        const shown = entries.slice(0, MAX_PER_ZONE);
        const originX = x - 0.36;
        const originZ = z - 0.34;
        shown.forEach((e, i) => {
          const [ox, oz] = zoneOffsets[i];
          const d = dishOf(e.code, slot);
          const cx = originX + ox;
          const cz = originZ + oz;
          const shape: Shape = slot === "drink" ? "cup" : d.shape;
          buildShape(shape, cx, cz, 0.72, d.color, (d as any).accent);
          const label = makeLabelSprite(e.qty > 1 ? `${e.name} ×${e.qty}` : e.name);
          label.position.set(cx, (slot === "drink" ? 1.3 : 0.98) + i * 0.34, cz);
          group.add(label);
          sprites.push(label);
        });
        const extra = entries.length - shown.length;
        if (extra > 0) {
          const more = makeLabelSprite(`+${extra} more`);
          more.position.set(x, 2.1, z);
          group.add(more);
          sprites.push(more);
        }
        return;
      }

      const e = entries[0];
      const d = dishOf(e.code, slot);
      const s = slot === "main" ? 1.6 : 1.0;
      buildShape(d.shape, x, z, s, d.color, (d as any).accent);
      const label = makeLabelSprite(e.qty > 1 ? `${e.name} ×${e.qty}` : e.name);
      label.position.set(x, slot === "main" ? 1.5 : 1.2, z);
      group.add(label);
      sprites.push(label);
    });

    group.rotation.x = 0.1;

    let raf = 0;
    let running = true;
    const animate = () => {
      if (!running) return;
      group.rotation.y += 0.0035;
      for (const s of sprites) s.quaternion.copy(camera.quaternion);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
          if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
          const m = obj.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach(x => x.dispose());
          else m.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [items]);

  return (
    <div
      className="rounded-xl p-6 border transition-all duration-300 cursor-default"
      style={{
        background: "var(--color-card)",
        backdropFilter: "blur(12px)",
        borderColor: "rgba(30,136,229,0.2)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <h2 className="text-sm font-bold uppercase tracking-[0.09em] text-[var(--color-text-secondary)]">
        Your tray
      </h2>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        A preview of how your selection will be served.
      </p>
      <div ref={mountRef} className="mt-4 w-full" style={{ height: 380 }} />
      <p className="mt-2 text-[10px] leading-snug text-[var(--color-text-muted)]">
        Illustrative tray layout. Actual presentation may vary.
      </p>
    </div>
  );
}
