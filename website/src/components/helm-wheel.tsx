import type { CSSProperties } from "react";

/**
 * The helm wheel from the KubeiQ logo, drawn flat: a rim, six spokes with handles and the cube at
 * the hub. The wheel takes `currentColor`; the cube faces take `cubeColor`.
 */
const SPOKES = [0, 60, 120, 180, 240, 300];

export function HelmWheel({
  className,
  style,
  cubeColor = "currentColor",
  title,
}: {
  className?: string;
  style?: CSSProperties;
  cubeColor?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="-100 -100 200 200"
      className={className}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g fill="currentColor">
        {/* rim */}
        <path
          fillRule="evenodd"
          d="M0,-70 A70,70 0 1 1 0,70 A70,70 0 1 1 0,-70 Z M0,-57 A57,57 0 1 0 0,57 A57,57 0 1 0 0,-57 Z"
        />
        {SPOKES.map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <rect x={-4} y={-74} width={8} height={52} />
            <rect x={-6.5} y={-97} width={13} height={27} rx={6.5} />
          </g>
        ))}
        <circle r={27} />
      </g>
      {/* the cube at the hub: three faces in three tones of one colour */}
      <g fill={cubeColor}>
        <path d="M0,-20 L17.3,-10 L0,0 L-17.3,-10 Z" opacity={1} />
        <path d="M-17.3,-10 L0,0 L0,20 L-17.3,10 Z" opacity={0.72} />
        <path d="M17.3,-10 L0,0 L0,20 L17.3,10 Z" opacity={0.48} />
      </g>
    </svg>
  );
}
