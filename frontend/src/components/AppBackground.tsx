"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/lib/theme-context";

/**
 * AppBackground — mounted once in the root layout.
 * Uses z-index: 0 (NOT negative) so it stays visible above the html background.
 * Page content in layout.tsx is wrapped at z-index: 1 to render above the canvas.
 */
export function AppBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const { theme } = useTheme();
  const dark = theme === "dark";

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    setReady(true);
    let raf = 0;
    let W = 0, H = 0;

    const resize = () => {
      W = cvs.width = window.innerWidth;
      H = cvs.height = window.innerHeight;
    };
    resize();

    const nodes = Array.from({ length: 50 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
    }));
    const planes = Array.from({ length: 5 }, () => ({
      x: Math.random() * W, y: 60 + Math.random() * (H - 120), s: 0.4 + Math.random() * 0.5,
    }));

    const nodeColor  = dark ? "rgba(130,185,255,0.55)" : "rgba(30,136,229,0.40)";
    const lineBase   = dark ? "59,157,255" : "30,136,229";
    const planeColor = dark ? "rgba(255,122,69,0.35)" : "rgba(245,124,0,0.30)";

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 130) {
            ctx.strokeStyle = `rgba(${lineBase},${0.18 * (1 - d / 130)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        ctx.fillStyle = nodeColor;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.4, 0, 7);
        ctx.fill();
      }

      for (const p of planes) {
        p.x += p.s;
        if (p.x > W + 30) { p.x = -30; p.y = 60 + Math.random() * (H - 120); }
        ctx.fillStyle = planeColor;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(-10, -3); ctx.lineTo(-7, 0); ctx.lineTo(-10, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      raf = requestAnimationFrame(draw);
    };

    draw();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [theme]);

  return (
    <>
      {/* Animated constellation canvas — z-index: 0, page content sits at z-index: 1 above it */}
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{
          position: "fixed", inset: 0,
          width: "100%", height: "100%",
          pointerEvents: "none",
          zIndex: 0,
          opacity: ready ? 1 : 0,
          transition: "opacity 0.5s ease-in",
        }}
      />

      {/* Blue radial glow — identical to landing page */}
      <div
        aria-hidden
        style={{
          position: "fixed", inset: 0,
          background: dark
            ? "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(30,136,229,0.16) 0%, transparent 70%)"
            : "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(30,136,229,0.08) 0%, transparent 72%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
    </>
  );
}
