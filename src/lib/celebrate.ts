/**
 * A small burst of accent-colored sparks from an element — played when a
 * task is ticked off. Pure Web Animations, no library; skipped when the
 * person prefers reduced motion.
 */
export function celebrate(from: Element | null) {
  if (!from || typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = from.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:90;overflow:hidden";
  document.body.appendChild(layer);

  const count = 10;
  let done = 0;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    const size = 3 + Math.random() * 3;
    const round = i % 3 !== 0;
    p.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;width:${size}px;height:${
      round ? size : size * 2.2
    }px;margin:${-size / 2}px;border-radius:${round ? "50%" : "2px"};background:var(${
      i % 2 ? "--accent" : "--accent-2"
    })`;
    layer.appendChild(p);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 16 + Math.random() * 18;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    p.animate(
      [
        { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 1 },
        {
          transform: `translate(${dx}px,${dy + 8}px) scale(0.4) rotate(${
            Math.random() * 180
          }deg)`,
          opacity: 0,
        },
      ],
      { duration: 520 + Math.random() * 200, easing: "cubic-bezier(0.16,1,0.3,1)" },
    ).onfinish = () => {
      if (++done === count) layer.remove();
    };
  }
}
