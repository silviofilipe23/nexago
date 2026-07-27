'use client';

import { useEffect } from 'react';
import { trackLinkPageEvent } from '@/lib/track-link-event';

/** Conta uma visita por montagem da página. Não renderiza nada. */
export function TrackPageView({ pageId }: { pageId: string }) {
  useEffect(() => {
    trackLinkPageEvent(pageId);
  }, [pageId]);

  return null;
}
