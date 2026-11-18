import React from 'react';

export interface GameComWordmarkProps {
  fill?: string;
  dotFill?: string;
  withPlanetRing?: boolean;
  stroke?: string;
  strokeWidth?: number;
  highlightFill?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Authentic 1997 Tiger Game.Com geometric micro-tech "game.com" wordmark
 * in a 228x34 coordinate space (baseline at y=24, x-height y=4..24, g descender to y=32).
 */
export const GameComWordmarkPaths: React.FC<GameComWordmarkProps> = ({
  fill = '#1e2228',
  dotFill,
  withPlanetRing = false,
  stroke,
  strokeWidth = 0
}) => {
  const dot = dotFill || fill;
  const strokeProps = stroke
    ? { stroke, strokeWidth, strokeLinejoin: 'round' as const }
    : {};

  return (
    <g fill={fill} {...strokeProps}>
      {/* 'g' (x: 0..24, y: 4..32) */}
      <path
        fillRule="evenodd"
        d="M 6 4 H 20 A 4 4 0 0 1 24 8 V 26 A 6 6 0 0 1 18 32 H 4 V 27 H 16 A 2.5 2.5 0 0 0 18.5 24.5 V 23 H 6 A 6 6 0 0 1 0 17 V 10 A 6 6 0 0 1 6 4 Z M 6.5 9 A 1.5 1.5 0 0 0 5 10.5 V 16.5 A 1.5 1.5 0 0 0 6.5 18 H 18.5 V 9 H 6.5 Z"
      />

      {/* 'a' (x: 29..53, y: 4..24) */}
      <path
        fillRule="evenodd"
        d="M 31 4 H 47 A 6 6 0 0 1 53 10 V 24 H 35 A 6 6 0 0 1 29 18 V 16 A 5 5 0 0 1 34 11 H 47.5 V 10.5 A 1.5 1.5 0 0 0 46 9 H 31 V 4 Z M 35.5 15.5 A 1.5 1.5 0 0 0 34 17 V 17.5 A 1.5 1.5 0 0 0 35.5 19 H 47.5 V 15.5 H 35.5 Z"
      />

      {/* 'm' (x: 58..92, y: 4..24) */}
      <path d="M 58 10 A 6 6 0 0 1 64 4 H 86 A 6 6 0 0 1 92 10 V 24 H 86.5 V 10.5 A 1.5 1.5 0 0 0 85 9 H 77.75 V 24 H 72.25 V 9 H 65 A 1.5 1.5 0 0 0 63.5 10.5 V 24 H 58 V 10 Z" />

      {/* 'e' (x: 97..121, y: 4..24) */}
      <path
        fillRule="evenodd"
        d="M 103 4 H 115 A 6 6 0 0 1 121 10 V 16 H 102.5 V 17.5 A 1.5 1.5 0 0 0 104 19 H 120 V 24 H 103 A 6 6 0 0 1 97 18 V 10 A 6 6 0 0 1 103 4 Z M 104 9 A 1.5 1.5 0 0 0 102.5 10.5 V 12 H 115.5 V 10.5 A 1.5 1.5 0 0 0 114 9 H 104 Z"
      />

      {/* '.' (x: 126..132, y: 18..24) + optional 1997 planet ring */}
      <rect x="126" y="18" width="6" height="6" rx="1.2" fill={dot} />
      {withPlanetRing && (
        <ellipse
          cx="129"
          cy="21"
          rx="9"
          ry="3.2"
          transform="rotate(-24 129 21)"
          fill="none"
          stroke={dot}
          strokeWidth="2.2"
        />
      )}

      {/* 'c' (x: 137..159, y: 4..24) */}
      <path d="M 143 4 H 158 V 9 H 144 A 1.5 1.5 0 0 0 142.5 10.5 V 17.5 A 1.5 1.5 0 0 0 144 19 H 158 V 24 H 143 A 6 6 0 0 1 137 18 V 10 A 6 6 0 0 1 143 4 Z" />

      {/* 'o' (x: 164..188, y: 4..24) */}
      <path
        fillRule="evenodd"
        d="M 170 4 H 182 A 6 6 0 0 1 188 10 V 18 A 6 6 0 0 1 182 24 H 170 A 6 6 0 0 1 164 18 V 10 A 6 6 0 0 1 170 4 Z M 171 9 A 1.5 1.5 0 0 0 169.5 10.5 V 17.5 A 1.5 1.5 0 0 0 171 19 H 181 A 1.5 1.5 0 0 0 182.5 17.5 V 10.5 A 1.5 1.5 0 0 0 181 9 H 171 Z"
      />

      {/* 'm' (x: 193..227, y: 4..24) */}
      <path d="M 193 10 A 6 6 0 0 1 199 4 H 221 A 6 6 0 0 1 227 10 V 24 H 221.5 V 10.5 A 1.5 1.5 0 0 0 220 9 H 212.75 V 24 H 207.25 V 9 H 200 A 1.5 1.5 0 0 0 198.5 10.5 V 24 H 193 V 10 Z" />
    </g>
  );
};

export const GameComLogo: React.FC<GameComWordmarkProps> = ({
  className = 'h-4 w-auto',
  style,
  ...props
}) => (
  <svg
    viewBox="0 0 228 34"
    className={className}
    style={style}
    aria-label="game.com"
    role="img"
  >
    <GameComWordmarkPaths {...props} />
  </svg>
);

/**
 * Authentic Tiger Electronics TIGER wordmark with seamless connected loop-tail and ® dot.
 * ViewBox 0 0 88 18.
 */
export const TigerWordmarkPaths: React.FC<{ fill?: string }> = ({ fill = '#1e2228' }) => (
  <g fill={fill}>
    <text
      x="0"
      y="14"
      fontFamily="sans-serif"
      fontWeight="900"
      fontStyle="italic"
      fontSize="15"
      letterSpacing="1.6"
    >
      TIGER
    </text>
    {/* Seamless loop-tail extending from the bottom-right leg of R */}
    <path
      d="M 55 11.6 H 76 A 1.5 1.5 0 0 0 76 8.6 H 71"
      fill="none"
      stroke={fill}
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    <circle cx="81" cy="11.2" r="1.5" />
  </g>
);
