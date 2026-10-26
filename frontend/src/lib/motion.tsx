import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * Outils d'animation sans bibliothèque. Tout reste décoratif : rien ne dépend d'eux pour fonctionner, et
 * `prefers-reduced-motion` les neutralise (CSS de index.css et garde ci-dessous).
 */

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Vrai dès que l'élément entre à l'écran (une seule fois) : lance une animation au bon moment. */
export function useInView<T extends Element>(ref: RefObject<T | null>, threshold = 0.35) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver !== "function") return setSeen(true);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, seen, threshold]);
  return seen;
}

/** Bloc dont les animations CSS internes attendent d'être visibles (`data-inview`, voir index.css). */
export function InView({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  return (
    <div ref={ref} data-inview={seen} className={className}>
      {children}
    </div>
  );
}

/**
 * Effet magnétique : l'enfant glisse légèrement vers le pointeur, puis revient avec un ressort. Le lien ou
 * le bouton reste l'élément interactif ; ce conteneur ne fait que le déplacer.
 */
export function Magnetic({ children, strength = 0.3 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const move = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || reducedMotion()) return;
    const box = el.getBoundingClientRect();
    const x = (e.clientX - box.left - box.width / 2) * strength;
    const y = (e.clientY - box.top - box.height / 2) * strength;
    el.style.transform = `translate(${x}px, ${y}px)`;
  };
  const leave = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <span ref={ref} onPointerMove={move} onPointerLeave={leave} className="magnetic inline-block">
      {children}
    </span>
  );
}

/**
 * Lumière qui suit le pointeur sur les cartes `.spot` de toute l'application : un seul écouteur délégué,
 * qui pose `--mx`/`--my` sur la carte survolée (aucun rendu React).
 */
export function useCardSpotlight() {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const card = (e.target as Element | null)?.closest?.<HTMLElement>(".spot, .card");
      if (!card) return;
      const box = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - box.left}px`);
      card.style.setProperty("--my", `${e.clientY - box.top}px`);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);
}

/**
 * Onde au clic sur tous les boutons `.btn` de l'application (un écouteur délégué) : un cercle part du
 * point de clic et s'efface. Purement visuel, retiré à la fin de son animation.
 */
export function useRipple() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const button = (e.target as Element | null)?.closest?.<HTMLElement>(".btn");
      if (!button || reducedMotion() || (button as HTMLButtonElement).disabled) return;
      const box = button.getBoundingClientRect();
      const size = Math.max(box.width, box.height) * 2;
      const wave = document.createElement("span");
      wave.className = "ripple";
      wave.setAttribute("aria-hidden", "true");
      wave.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - box.left - size / 2}px;top:${e.clientY - box.top - size / 2}px`;
      button.append(wave);
      wave.addEventListener("animationend", () => wave.remove(), { once: true });
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
}

/**
 * Nombre qui compte jusqu'à sa valeur quand il arrive à l'écran (une fois). Le texte final est toujours
 * présent pour les lecteurs d'écran ; seule l'animation visible est décorative.
 */
export function CountUp({
  value,
  format = (n) => String(n),
}: {
  value: number;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, 0.2);
  const [shown, setShown] = useState(reducedMotion() ? value : 0);
  useEffect(() => {
    if (!seen) return;
    if (reducedMotion() || !Number.isFinite(value)) return setShown(value);
    const start = performance.now();
    const duration = 1100;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Number.isInteger(value) ? Math.round(value * eased) : value * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [seen, value]);
  return (
    <span ref={ref}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

/** Pluie de confettis citron (célébration d'un score de 100 %) : 18 éclats en CSS, une seule fois. */
export function Confetti() {
  const pieces = Array.from({ length: 18 }, (_, i) => i);
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible">
      {pieces.map((i) => (
        <span
          key={i}
          className="confetti"
          style={
            {
              "--angle": `${(i * 360) / pieces.length}deg`,
              "--distance": `${48 + (i % 3) * 18}px`,
              "--delay": `${(i % 6) * 40}ms`,
              "--hue": i % 3 === 0 ? "var(--accent)" : i % 3 === 1 ? "var(--proved)" : "var(--ink)",
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/**
 * Curseur personnalisé (bureau, souris uniquement) : un point citron qui suit le pointeur et un anneau qui
 * le rattrape avec retard, grossi au-dessus des éléments cliquables. Le curseur système reste visible.
 */
export function CustomCursor() {
  const dot = useRef<HTMLSpanElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (reducedMotion() || !matchMedia("(pointer: fine)").matches) return;
    let x = 0,
      y = 0,
      rx = 0,
      ry = 0,
      frame = 0;
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      const hot = (e.target as Element | null)?.closest?.("a, button, input, select, textarea, label");
      ring.current?.classList.toggle("is-hot", Boolean(hot));
      dot.current?.style.setProperty("transform", `translate(${x}px, ${y}px)`);
    };
    const loop = () => {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      ring.current?.style.setProperty("transform", `translate(${rx}px, ${ry}px)`);
      frame = requestAnimationFrame(loop);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    frame = requestAnimationFrame(loop);
    document.documentElement.classList.add("has-cursor");
    return () => {
      document.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
      document.documentElement.classList.remove("has-cursor");
    };
  }, []);
  return (
    <>
      <span ref={ring} aria-hidden="true" className="cursor-ring" />
      <span ref={dot} aria-hidden="true" className="cursor-dot" />
    </>
  );
}
