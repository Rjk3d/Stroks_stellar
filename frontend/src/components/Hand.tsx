import type { Move } from '../game';

// Original vector illustrations, shared by the logo, choice cards and reel.
export function Hand({ move, className = '' }: { move: Move; className?: string }) {
  return (
    <svg
      className={`hand hand-${move} ${className}`}
      viewBox="0 0 240 240"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="#25283D" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        {move === 'rock' && (
          <>
            <path
              d="M73 173l-5-24-12-23c-7-14-4-32 5-37l4-18c3-13 17-18 27-12 5-16 24-19 34-7 11-10 28-5 31 8 15-4 27 5 27 19l1 21c18 10 21 26 13 43l-18 30-2 26H82z"
              fill="#FFD36D"
            />
            <path d="M65 91l1 26c0 11 18 16 25 3m1-61l1 48c0 14 19 18 26 6m7-61l1 52c0 12 17 16 25 6m5-50l2 44c0 9 15 13 25 4" />
            <path
              d="M71 148c6-20 21-33 41-30l33 7c12 4 9 22-4 23l-27-1c14 5 25 16 24 33"
              fill="#FFD36D"
            />
            <path d="M86 199h90v18H85z" fill="#FFF8EC" />
            <path d="M95 177l12 2m50-18l8-7" stroke="#D99B38" strokeWidth="4" />
          </>
        )}
        {move === 'paper' && (
          <>
            <path
              d="M91 194c-25-14-36-38-49-65l-9-21c-5-13 11-23 20-11l22 29-3-77c-1-18 23-21 26-3l6 55-1-72c0-19 26-19 27 0l3 69 5-58c2-18 26-15 25 3l-2 66 8-36c4-18 27-12 23 6l-10 79c-2 13-13 27-26 36l-1 25H93z"
              fill="#FFAFA0"
            />
            <path d="M76 127c23 3 39 20 39 42m-11-67l2 30m27-33l1 34m27-24l-2 28m-35 24c6-10 15-15 24-16" />
            <path d="M92 199h66v20H92z" fill="#FFF8EC" />
            <path d="M97 181l12 4" stroke="#DC786F" strokeWidth="4" />
          </>
        )}
        {move === 'scissors' && (
          <>
            <path
              d="M98 194l-2-16c-18-7-30-19-33-36l-6-31c-3-17 18-23 24-7l5 16 5-2-13-77c-4-20 22-26 27-6l18 72 25-77c7-19 31-11 25 9l-25 80c15-1 23 9 21 21 17 6 19 23 7 40l-14 17-2 24H99z"
              fill="#C1ADFA"
            />
            <path
              d="M94 119l29-12m25 12l-21 9c-11 6-6 23 6 21l23-7m-60-24l18 16c11 10 1 28-11 20l-18-12m48 8c14 4 20 16 16 26"
              fill="#C1ADFA"
            />
            <path d="M98 199h65v20H98z" fill="#FFF8EC" />
            <path d="M111 181l11 3" stroke="#9177D1" strokeWidth="4" />
          </>
        )}
      </g>
      <g fill="#FFF8EC" opacity=".7">
        {move === 'rock' ? (
          <path d="M74 75c1-5 6-6 8-3v26c-4 6-8 1-8-2z" />
        ) : move === 'paper' ? (
          <path d="M112 31c0-5 6-5 6 0l2 55c-1 6-6 6-6 0z" />
        ) : (
          <path d="M157 34c2-6 7-4 5 2l-19 61c-2 6-7 4-5-2z" />
        )}
      </g>
    </svg>
  );
}

export function Spark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M24 2l5 16 17 6-17 5-5 17-5-17-17-5 17-6z"
        fill="currentColor"
        stroke="#25283D"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
