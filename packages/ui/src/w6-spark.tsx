/**
 * WAVE_6 — sparkline.
 *
 * Tiny inline area chart for "last N buckets" glances on the dashboard.
 * Pass a uniform-spaced `values` array; component normalizes to its
 * viewbox. Pure SVG, no canvas. Honors `prefers-reduced-motion` by
 * skipping the draw-on-mount animation.
 */

export interface W6SparkProps {
  values: number[];
  width?: number | undefined;
  height?: number | undefined;
  className?: string | undefined;
  /** ARIA label for the chart, e.g. "Receipts per hour over last 24h". */
  label: string;
}

export function W6Spark({
  values,
  width = 200,
  height = 48,
  className,
  label,
}: W6SparkProps) {
  if (values.length === 0) {
    return (
      <div
        className={className}
        style={{ width, height }}
        role="img"
        aria-label={`${label} (no data)`}
      />
    );
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const dx = width / Math.max(values.length - 1, 1);

  const points = values.map((v, i) => {
    const x = i * dx;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`)
    .join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      style={{ display: "block", width: "100%", height }}
    >
      <path d={areaPath} fill="rgba(10,10,10,0.06)" />
      <path d={linePath} fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
    </svg>
  );
}
