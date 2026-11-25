import { useLayoutEffect, useRef, useState } from 'react';
import type { DependencyList } from 'react';

export interface NavIndicatorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Mengukur kotak tombol aktif (`data-nav-active="true"`) relatif terhadap
 * kontainer, agar indikator latar bisa meluncur saat tab berpindah. Kontainer
 * wajib memakai `position: relative`. Pengukuran diulang saat ukuran kontainer
 * atau tombol berubah (mis. font selesai dimuat / jendela di-resize).
 */
export function useSlidingIndicator(deps: DependencyList) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<NavIndicatorRect | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const active = container.querySelector<HTMLElement>('[data-nav-active="true"]');
      if (!active) {
        setRect(null);
        return;
      }
      setRect({
        left: active.offsetLeft,
        top: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    const active = container.querySelector<HTMLElement>('[data-nav-active="true"]');
    if (active) observer.observe(active);
    return () => observer.disconnect();
  }, deps);

  return { containerRef, rect };
}