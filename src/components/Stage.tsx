import { useEffect, useRef, useState } from "react";
import type { Rig, Clip } from "../types";
import { drawRig, stateAt } from "../../core/engine.mjs";
import { drawAnalysis } from "../../core/analysis.mjs";
export default function Stage({
  rig,
  clip,
  time,
  grid,
  joints,
  mode,
  selected,
  hidden,
  onSelect,
}: {
  rig: Rig;
  clip: Clip;
  time: number;
  grid: boolean;
  joints: boolean;
  mode: string;
  selected: string | null;
  hidden: string[];
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    [images, setImages] = useState<Record<string, HTMLImageElement>>({}),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all(
      rig.assets.map(
        (a) =>
          new Promise<[string, HTMLImageElement]>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve([a, img]);
            img.onerror = () => reject(Error(`Missing asset: ${a}`));
            img.src = a;
          }),
      ),
    )
      .then((items) => {
        if (!cancelled) setImages(Object.fromEntries(items));
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [rig.assets]);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx || Object.keys(images).length !== rig.assets.length) return;
    if (mode === "artwork")
      drawRig(ctx, rig, clip, time, images, { grid, joints, selected, hidden });
    else drawAnalysis(ctx, rig, clip, time, images, mode);
  }, [rig, clip, time, images, grid, joints, mode, selected, hidden]);
  return (
    <div className="stage-surface">
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <canvas
          ref={ref}
          width={rig.canvas[0]}
          height={rig.canvas[1]}
          aria-label={`${rig.name}, ${clip.name}, ${mode} preview`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect(),
              x = ((e.clientX - r.left) * rig.canvas[0]) / r.width,
              y = ((e.clientY - r.top) * rig.canvas[1]) / r.height;
            const parts = stateAt(rig, clip, time).filter(
              (p) => p.visible && !hidden.includes(p.id),
            );
            const nearest = parts
              .map((p) => ({
                id: p.id,
                d: Math.hypot(p.joint[0] - x, p.joint[1] - y),
              }))
              .sort((a, b) => a.d - b.d)[0];
            if (nearest && nearest.d < 55) onSelect(nearest.id);
          }}
        />
      )}
    </div>
  );
}
