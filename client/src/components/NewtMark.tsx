import { useId } from 'react';

// The newt logo glyph, no wordmark. Used in the header and as the floating
// logo that parks beside the pinned search bar. Each instance gets a unique
// gradient id (useId) so multiple marks can coexist on the page.
export default function NewtMark({ className }: { className?: string }) {
  const gid = useId();
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="20" y1="14" x2="82" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0"   stopColor="#9B8CFF" />
          <stop offset=".55" stopColor="#5BC8E6" />
          <stop offset="1"   stopColor="#36D6A6" />
        </linearGradient>
      </defs>
      <path d="M41 23 C60 15 81 27 80 49 C79 70 61 83 43 80 C28.5 77.5 19.5 64 25 50 C29 39.5 41 37 49 47 C53.5 52.5 51 59 48.5 58.5" fill="none" stroke={`url(#${gid})`} strokeWidth="15.5" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="41" cy="23" rx="12.5" ry="11.5" fill={`url(#${gid})`} />
      <path d="M64 78 L67 90 M82 56 L92 57 M30 66 L22 75" fill="none" stroke={`url(#${gid})`} strokeWidth="6.5" strokeLinecap="round" />
      <path d="M44 30 C57 25 71 33 71 47" fill="none" stroke="#ffffff" strokeOpacity=".28" strokeWidth="4" strokeLinecap="round" />
      <circle cx="37.5" cy="20.5" r="3.1" fill="var(--bg)" />
      <circle cx="38.6" cy="19.4" r="1.05" fill="#fff" />
    </svg>
  );
}
