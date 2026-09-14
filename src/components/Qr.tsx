import { useMemo } from 'react';
import { encode } from 'uqr';

export function Qr({ value, size = 168, label }: { value: string; size?: number; label: string }) {
  const { path, dim } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    qr.data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { path: d, dim: qr.size };
  }, [value]);
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${dim} ${dim}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={dim} height={dim} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
