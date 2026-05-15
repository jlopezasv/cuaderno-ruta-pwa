import { useEffect, useRef, useState } from "react";

/** Miniatura lazy: no carga imagen hasta entrar en viewport. */
export function LazyDocumentThumb({ src, alt = "", style = {}, onClick }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "80px", threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [src]);

  const box = {
    width: 44,
    height: 44,
    borderRadius: 8,
    flexShrink: 0,
    background: "#e2e8f0",
    overflow: "hidden",
    border: "1px solid #cbd5e1",
    ...style,
  };

  if (!src) {
    return (
      <div ref={ref} style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
        📎
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role={onClick ? "button" : undefined}
      onClick={onClick}
      style={{ ...box, cursor: onClick ? "pointer" : "default" }}
    >
      {visible ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: loaded ? 1 : 0,
            transition: "opacity .2s",
          }}
        />
      ) : null}
    </div>
  );
}
