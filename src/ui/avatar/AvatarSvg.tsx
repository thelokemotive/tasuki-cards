// Placeholder runner avatar; the full modular avatar is built in Milestone 3.
import type { Avatar } from '../../types';
import type { AvatarUnlocks } from '../../engine/avatarUnlocks';

export function AvatarSvg({ avatar, className }: { avatar: Avatar; unlocks?: AvatarUnlocks; className?: string }) {
  const skins = ['#f6d7bd', '#eec39a', '#d9a477', '#b97f55', '#8d5a3b', '#5e3b26'];
  return (
    <svg viewBox="0 0 100 120" className={className} role="img" aria-label="Runner avatar">
      <circle cx="50" cy="30" r="16" fill={skins[avatar.skinTone % 6]} />
      <path d="M30 60 Q50 46 70 60 L66 96 H34 Z" fill="#1f3a6e" />
      <path d="M38 96 L32 118 M62 96 L70 118" stroke={skins[avatar.skinTone % 6]} strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}
