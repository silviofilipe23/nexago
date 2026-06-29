import { STATUS_META } from '@/lib/format';
import type { TournamentListingStatus } from '@/lib/firestore/types';

const TONE_CLASSES: Record<string, string> = {
  live: 'border-live/30 bg-live/10 text-live',
  open: 'border-brand/30 bg-brand-tint text-brand',
  pending: 'border-pending/30 bg-pending/10 text-pending',
  muted: 'border-line-strong bg-surface-2 text-text-mute',
};

export function StatusBadge({ status }: { status: TournamentListingStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-600 ${TONE_CLASSES[meta.tone]}`}
    >
      {meta.tone === 'live' && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-70" />
          <span className="relative inline-flex size-1.5 rounded-full bg-live" />
        </span>
      )}
      {meta.label}
    </span>
  );
}
