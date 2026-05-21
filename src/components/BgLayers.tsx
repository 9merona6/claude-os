import { memo, useEffect, useRef } from "react";

function BgLayersImpl() {
  const particlesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = particlesRef.current;
    if (!root) return;
    root.innerHTML = "";
    // Reduced from 14 to 5 — animated DOM nodes were forcing constant
    // layer recomposites during typing.
    for (let i = 0; i < 5; i++) {
      const p = document.createElement("div");
      p.className = "particle";
      p.style.left = Math.random() * 100 + "%";
      p.style.bottom = "-10px";
      p.style.animationDuration = (12 + Math.random() * 18) + "s";
      p.style.animationDelay = Math.random() * 20 + "s";
      p.style.opacity = String(0.3 + Math.random() * 0.6);
      const s = 1 + Math.random() * 2;
      p.style.width = s + "px";
      p.style.height = s + "px";
      root.appendChild(p);
    }
  }, []);

  return (
    <div className="bg-layers">
      <div className="bg-radial" />
      <div className="bg-grid" />
      <div className="bg-scanlines" />
      <div className="bg-vignette" />
      <div className="particles" ref={particlesRef} />
    </div>
  );
}

export const BgLayers = memo(BgLayersImpl);

