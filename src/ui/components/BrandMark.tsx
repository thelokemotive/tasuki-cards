// Original mark: a rounded tile crossed by a diagonal tasuki sash.
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="nav-brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#fff" />
      <path d="M1 22 L22 1 H30 L1 30 Z" fill="#d4442a" />
      <path d="M8 31 L31 8 V13 L13 31 Z" fill="#1f3a6e" opacity="0.18" />
    </svg>
  );
}
