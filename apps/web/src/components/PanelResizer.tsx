import { useCallback, useRef } from "react";

interface PanelResizerProps {
  onResize: (pct: number) => void;
  min?: number;
  max?: number;
}

export function PanelResizer({ onResize, min = 25, max = 75 }: PanelResizerProps) {
  const dragging = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);

      const container = el.parentElement!;

      const onPointerMove = (ev: PointerEvent) => {
        if (!dragging.current) return;
        const rect = container.getBoundingClientRect();
        let pct = ((ev.clientX - rect.left) / rect.width) * 100;
        pct = Math.max(min, Math.min(max, pct));
        onResize(pct);
      };

      const onPointerUp = () => {
        dragging.current = false;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [onResize, min, max],
  );

  return (
    <div
      className="group relative z-10 flex w-0 shrink-0 cursor-col-resize items-center justify-center"
      onPointerDown={onPointerDown}
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
      <div className="absolute inset-y-0 w-px bg-border transition-colors group-hover:w-[3px] group-hover:bg-blue-500 group-active:w-[3px] group-active:bg-blue-500" />
    </div>
  );
}
