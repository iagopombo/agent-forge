import type { ReactElement } from 'react';
import type { PhaseId } from '../types';

/**
 * El personaje de cada agente: un muñeco de Claude con la herramienta de su
 * oficio. Dibujo vectorial sobre un viewBox 96×96 para que escale a cualquier
 * tamaño y recoloree sin pixelarse.
 */
const CREAM = '#efe7d8';
const FACE = '#2b2f3a';

const MASCOTS: Record<PhaseId, ReactElement> = {
  product: (
    <>
      <path d="M48 18c17 0 30 12 30 29 0 10-5 18-13 23-1 .7-2 1.9-2 3.3v6c0 2.3-2.6 3.6-4.5 2.3l-9-6c-.5-.3-1-.5-1.6-.5C31 75 18 63 18 47 18 30 31 18 48 18Z" fill={CREAM} />
      <ellipse cx="41" cy="45" rx="3.9" ry="5.2" fill={FACE} />
      <ellipse cx="57" cy="45" rx="3.9" ry="5.2" fill={FACE} />
      <circle cx="34" cy="53" r="3.2" fill="#f5c451" opacity="0.5" />
      <circle cx="64" cy="53" r="3.2" fill="#f5c451" opacity="0.5" />
      <path d="M41 55c3.2 3.4 11.8 3.4 15 0" stroke={FACE} strokeWidth="2.8" strokeLinecap="round" />
      <path d="M74 8c-6.6 0-11 4.4-11 10 0 3.4 1.7 5.9 3.6 7.7.9.8 1.5 1.7 1.7 2.8l.3 1.5h10.8l.3-1.5c.2-1.1.8-2 1.7-2.8C85.3 23.9 87 21.4 87 18c0-5.6-4.4-10-11-10Z" fill="#f5c451" />
      <rect x="69" y="31" width="10" height="3.6" rx="1.8" fill="#cfa63a" />
      <rect x="70.5" y="35.5" width="7" height="3" rx="1.5" fill="#cfa63a" />
      <path d="M74 3v-3M62 8l-2.4-2M86 8l2.4-2" stroke="#f5c451" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  design: (
    <>
      <path d="M48 18c17 0 30 12 30 29 0 10-5 18-13 23-1 .7-2 1.9-2 3.3v6c0 2.3-2.6 3.6-4.5 2.3l-9-6c-.5-.3-1-.5-1.6-.5C31 75 18 63 18 47 18 30 31 18 48 18Z" fill={CREAM} />
      <ellipse cx="41" cy="45" rx="3.9" ry="5.2" fill={FACE} />
      <ellipse cx="57" cy="45" rx="3.9" ry="5.2" fill={FACE} />
      <circle cx="34" cy="53" r="3.2" fill="#ff9d7a" opacity="0.5" />
      <circle cx="64" cy="53" r="3.2" fill="#ff9d7a" opacity="0.5" />
      <path d="M41 55c3.2 3.4 11.8 3.4 15 0" stroke={FACE} strokeWidth="2.8" strokeLinecap="round" />
      <g transform="translate(58 14) rotate(-10)">
        <path d="M14 0c8 0 14 6 14 13 0 4-2 6-5 6-2 0-3-1-3-3 0-1 1-2 1-3 0-4-4-6-7-6-8 0-14 5-14 12 0 8 6 13 14 13 9 0 16-6 16-15C30 8 23 0 14 0Z" fill="#f3e3d3" stroke="#c9a06a" strokeWidth="1.4" />
        <circle cx="9" cy="9" r="2.1" fill="#f5c451" />
        <circle cx="18" cy="7" r="2.1" fill="#ff9d7a" />
        <circle cx="22" cy="15" r="2.1" fill="#7f9cff" />
        <circle cx="10" cy="20" r="2.1" fill="#63c8bf" />
      </g>
      <g transform="translate(72 44) rotate(35)">
        <rect x="-1.6" y="-2" width="3.2" height="20" rx="1.6" fill="#c9a06a" />
        <path d="M-3-2c0-4 6-4 6 0Z" fill="#3a3350" />
      </g>
    </>
  ),
  architect: (
    <>
      <path d="M48 24c17 0 30 12 30 29 0 10-5 18-13 23-1 .7-2 1.9-2 3.3v6c0 2.3-2.6 3.6-4.5 2.3l-9-6c-.5-.3-1-.5-1.6-.5C31 81 18 69 18 53 18 36 31 24 48 24Z" fill={CREAM} />
      <ellipse cx="41" cy="50" rx="3.9" ry="5.2" fill={FACE} />
      <ellipse cx="57" cy="50" rx="3.9" ry="5.2" fill={FACE} />
      <circle cx="34" cy="58" r="3.2" fill="#f2a33c" opacity="0.5" />
      <circle cx="64" cy="58" r="3.2" fill="#f2a33c" opacity="0.5" />
      <path d="M41 60c3.2 3.4 11.8 3.4 15 0" stroke={FACE} strokeWidth="2.8" strokeLinecap="round" />
      <path d="M24 27c0-13 10-21 24-21s24 8 24 21Z" fill="#f2a33c" />
      <path d="M45 7c-4 1-7 4-8.5 9M51 7c4 1 7 4 8.5 9" stroke="#d98324" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="44.5" y="5" width="7" height="12" rx="2" fill="#d98324" />
      <rect x="16" y="25" width="64" height="6" rx="3" fill="#e08b2a" />
      <rect x="16" y="25" width="64" height="2.6" rx="1.3" fill="#f6b45c" />
    </>
  ),
  backend: (
    <>
      <path d="M48 18c17 0 30 12 30 29 0 10-5 18-13 23-1 .7-2 1.9-2 3.3v6c0 2.3-2.6 3.6-4.5 2.3l-9-6c-.5-.3-1-.5-1.6-.5C31 75 18 63 18 47 18 30 31 18 48 18Z" fill={CREAM} />
      <ellipse cx="41" cy="45" rx="3.9" ry="5.2" fill={FACE} />
      <ellipse cx="57" cy="45" rx="3.9" ry="5.2" fill={FACE} />
      <circle cx="34" cy="53" r="3.2" fill="#7f9cff" opacity="0.5" />
      <circle cx="64" cy="53" r="3.2" fill="#7f9cff" opacity="0.5" />
      <path d="M41 55c3.2 3.4 11.8 3.4 15 0" stroke={FACE} strokeWidth="2.8" strokeLinecap="round" />
      <g transform="translate(72 20)">
        <path d="M0-13 2.3-8.7 7-9.6 7.4-4.8 12-3.4 9.4 .6 12 4.6 7.4 6 7 10.8 2.3 9.9 0 14.2-2.3 9.9-7 10.8-7.4 6-12 4.6-9.4 .6-12-3.4-7.4-4.8-7-9.6-2.3-8.7Z" fill="#7f9cff" />
        <circle r="4.4" fill="#12151d" />
      </g>
      <g transform="translate(63 60) rotate(38)">
        <rect x="-3" y="-2" width="22" height="6" rx="3" fill="#9fb4ff" />
        <path d="M-3 1c-6 0-10-3-10-8 0-1 .2-2 .6-3l4.6 4.6 3.8-1 1-3.8L-8 -16c1-.4 2-.6 3-.6 5 0 8 4 8 10 0 4-2 7-6 8Z" fill="#7f9cff" />
      </g>
    </>
  ),
  frontend: (
    <>
      <path d="M48 22c17 0 30 12 30 29 0 10-5 18-13 23-1 .7-2 1.9-2 3.3v6c0 2.3-2.6 3.6-4.5 2.3l-9-6c-.5-.3-1-.5-1.6-.5C31 79 18 67 18 51 18 34 31 22 48 22Z" fill={CREAM} />
      <ellipse cx="41" cy="48" rx="3.9" ry="5.2" fill={FACE} />
      <ellipse cx="57" cy="48" rx="3.9" ry="5.2" fill={FACE} />
      <circle cx="34" cy="56" r="3.2" fill="#b98cff" opacity="0.5" />
      <circle cx="64" cy="56" r="3.2" fill="#b98cff" opacity="0.5" />
      <path d="M41 58c3.2 3.4 11.8 3.4 15 0" stroke={FACE} strokeWidth="2.8" strokeLinecap="round" />
      <path d="M27 25c0-8 9-13 21-13s21 4 21 11c0 4-4 5-9 5H35c-5 0-8-1-8-3Z" fill="#3a3350" />
      <path d="M27 25c0-8 9-13 21-13" stroke="#5a4f7a" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="66" cy="9" r="3" fill="#b98cff" />
      <g transform="translate(64 58) rotate(45)">
        <rect x="-2.4" y="-4" width="5" height="20" rx="2.5" fill="#c9a06a" />
        <rect x="-3" y="-9" width="6" height="6" rx="1.6" fill="#9aa4b2" />
        <path d="M-3 -9c0-4 6-4 6 0Z" fill="#b98cff" />
        <path d="M0 16c3 0 5 2 5 6-4 1-6-1-6-3Z" fill="#b98cff" />
      </g>
    </>
  ),
  integration: (
    <>
      <path d="M48 18c17 0 30 12 30 29 0 10-5 18-13 23-1 .7-2 1.9-2 3.3v6c0 2.3-2.6 3.6-4.5 2.3l-9-6c-.5-.3-1-.5-1.6-.5C31 75 18 63 18 47 18 30 31 18 48 18Z" fill={CREAM} />
      <ellipse cx="41" cy="44" rx="3.9" ry="5.2" fill={FACE} />
      <ellipse cx="57" cy="44" rx="3.9" ry="5.2" fill={FACE} />
      <circle cx="34" cy="52" r="3.2" fill="#63c8bf" opacity="0.5" />
      <circle cx="64" cy="52" r="3.2" fill="#63c8bf" opacity="0.5" />
      <path d="M41 54c3.2 3.4 11.8 3.4 15 0" stroke={FACE} strokeWidth="2.8" strokeLinecap="round" />
      <g transform="translate(30 60)">
        <path d="M0 0h7a3 3 0 016 0h7v7a3 3 0 010 6v3H0Z" fill="#63c8bf" />
        <path d="M27 -3v6a3 3 0 006 0h1a3 3 0 010 6h-1v10H16v-6a3 3 0 000-6V-3Z" fill="#3f9c95" />
      </g>
    </>
  ),
  review: (
    <>
      <path d="M48 18c17 0 30 12 30 29 0 10-5 18-13 23-1 .7-2 1.9-2 3.3v6c0 2.3-2.6 3.6-4.5 2.3l-9-6c-.5-.3-1-.5-1.6-.5C31 75 18 63 18 47 18 30 31 18 48 18Z" fill={CREAM} />
      <ellipse cx="41" cy="44" rx="3.9" ry="5.2" fill={FACE} />
      <ellipse cx="57" cy="44" rx="3.9" ry="5.2" fill={FACE} />
      <circle cx="34" cy="52" r="3.2" fill="#8fa8d6" opacity="0.5" />
      <circle cx="64" cy="52" r="3.2" fill="#8fa8d6" opacity="0.5" />
      <path d="M40 54c3 3 8 3 10 0" stroke={FACE} strokeWidth="2.8" strokeLinecap="round" />
      <g transform="translate(58 54)">
        <circle cx="7" cy="7" r="12" fill="#0a0c10" stroke="#9fb4ff" strokeWidth="4" />
        <circle cx="7" cy="7" r="12" fill="#7f9cff" opacity="0.14" />
        <path d="M4 7a3 3 0 013-3" stroke="#cdd8ff" strokeWidth="2.4" strokeLinecap="round" />
        <rect x="15" y="15" width="7" height="17" rx="3.5" transform="rotate(-45 15 15)" fill="#7f9cff" />
      </g>
    </>
  ),
  fix: (
    <>
      <path d="M48 18c17 0 30 12 30 29 0 10-5 18-13 23-1 .7-2 1.9-2 3.3v6c0 2.3-2.6 3.6-4.5 2.3l-9-6c-.5-.3-1-.5-1.6-.5C31 75 18 63 18 47 18 30 31 18 48 18Z" fill={CREAM} />
      <ellipse cx="41" cy="45" rx="3.9" ry="5.2" fill={FACE} />
      <ellipse cx="57" cy="45" rx="3.9" ry="5.2" fill={FACE} />
      <circle cx="64" cy="53" r="3.2" fill="#f5c451" opacity="0.5" />
      <path d="M41 55c3.2 3.4 11.8 3.4 15 0" stroke={FACE} strokeWidth="2.8" strokeLinecap="round" />
      <g transform="translate(30 50) rotate(-24)">
        <rect x="-9" y="-4" width="18" height="8" rx="4" fill="#f5c451" />
        <rect x="-3" y="-4" width="6" height="8" fill="#e0ad33" />
        <circle cx="-6" cy="-1.6" r="0.9" fill="#c99a2a" /><circle cx="-6" cy="1.6" r="0.9" fill="#c99a2a" />
        <circle cx="6" cy="-1.6" r="0.9" fill="#c99a2a" /><circle cx="6" cy="1.6" r="0.9" fill="#c99a2a" />
      </g>
      <g transform="translate(62 58) rotate(40)">
        <rect x="-3" y="-14" width="6" height="12" rx="3" fill="#7f9cff" />
        <rect x="-1.6" y="-2" width="3.2" height="16" fill="#c7d2e6" />
        <rect x="-2.4" y="13" width="4.8" height="3" rx="1" fill="#9aa4b2" />
      </g>
    </>
  ),
  package: (
    <>
      <path d="M48 16c17 0 30 12 30 29 0 10-5 18-13 23-1 .7-2 1.9-2 3.3v6c0 2.3-2.6 3.6-4.5 2.3l-9-6c-.5-.3-1-.5-1.6-.5C31 73 18 61 18 45 18 28 31 16 48 16Z" fill={CREAM} />
      <ellipse cx="41" cy="42" rx="3.9" ry="5.2" fill={FACE} />
      <ellipse cx="57" cy="42" rx="3.9" ry="5.2" fill={FACE} />
      <circle cx="34" cy="50" r="3.2" fill="#b98cff" opacity="0.5" />
      <circle cx="64" cy="50" r="3.2" fill="#b98cff" opacity="0.5" />
      <path d="M41 52c3.2 3.4 11.8 3.4 15 0" stroke={FACE} strokeWidth="2.8" strokeLinecap="round" />
      <g transform="translate(30 58)">
        <path d="M0 8 18-1 36 8 18 17Z" fill="#c99b63" />
        <path d="M0 8v20l18 9V17Z" fill="#a97e46" />
        <path d="M36 8v20l-18 9V17Z" fill="#b98a54" />
        <path d="M18 -1v18" stroke="#8a6636" strokeWidth="1.6" />
        <path d="M18 3l6 12M18 3l-6 12" stroke="#b98cff" strokeWidth="3" strokeLinecap="round" />
        <path d="M14 1c2-3 6-1 4 3M22 1c-2-3-6-1-4 3" fill="none" stroke="#b98cff" strokeWidth="3" strokeLinecap="round" />
      </g>
    </>
  ),
};

export function Mascot({ phase, size = 56 }: { phase: PhaseId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true">
      {MASCOTS[phase]}
    </svg>
  );
}
