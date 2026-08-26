'use client';

import type { ReactNode } from 'react';
import { Search } from 'lucide-react';

/** Controles de filtro compartilhados entre as listagens do hub (torneios, ligas…). */

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-dim"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-11 w-full rounded-pill border border-line bg-surface-0 pl-11 pr-4 text-sm text-fg placeholder:text-text-dim focus-visible:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      />
    </div>
  );
}

export function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="font-mono text-xs font-600 uppercase tracking-wider text-text-dim sm:w-16 sm:shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-pill border px-4 py-2 text-sm font-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
        active
          ? 'border-brand/40 bg-brand-tint text-brand'
          : 'border-line bg-surface-0 text-text-mute hover:border-line-strong hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}
