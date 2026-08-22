'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { searchDocs } from '@/lib/docs/search';
import type { SearchDoc } from '@/lib/docs/types';

const AUDIENCE_TONE: Record<SearchDoc['audience'], string> = {
  atletas: 'text-brand bg-brand-tint',
  organizadores: 'text-win bg-win/12',
  arenas: 'text-pending bg-pending/12',
};

export function DocsSearch({ index, hero = false }: { index: SearchDoc[]; hero?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const results = useMemo(() => searchDocs(index, query), [index, query]);

  // "/" foca a busca de qualquer lugar da página (fora de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const go = (doc: SearchDoc) => {
    setOpen(false);
    setQuery('');
    router.push(`/docs/${doc.audience}#${doc.id}`);
  };

  const showPanel = open && query.trim().length >= 2;

  return (
    <div ref={rootRef} className={`relative ${hero ? 'mx-auto w-full max-w-xl' : 'w-full'}`}>
      <div
        className={`flex items-center gap-3 rounded-pill border bg-surface-1 transition-colors duration-200 focus-within:border-brand ${
          hero ? 'border-line-strong px-5 py-3.5 shadow-elev-2' : 'border-line px-4 py-2.5'
        }`}
      >
        <Search className={`shrink-0 text-text-dim ${hero ? 'size-5' : 'size-4'}`} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label="Buscar na documentação"
          placeholder="Busque uma funcionalidade — inscrição, chaves, reservas…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
            } else if (e.key === 'ArrowDown' && results.length > 0) {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, results.length - 1));
            } else if (e.key === 'ArrowUp' && results.length > 0) {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === 'Enter' && showPanel && results[cursor]) {
              e.preventDefault();
              go(results[cursor]);
            }
          }}
          className={`w-full bg-transparent text-fg outline-none placeholder:text-text-dim ${hero ? 'text-base' : 'text-sm'}`}
        />
        <kbd
          className="hidden shrink-0 rounded-1 border border-line px-1.5 py-0.5 font-mono text-[10px] text-text-dim sm:inline-block"
          aria-hidden="true"
        >
          /
        </kbd>
      </div>

      {showPanel && (
        <div className="absolute inset-x-0 top-full z-30 pt-2">
          <div className="max-h-[26rem] overflow-y-auto rounded-4 border border-line bg-surface-1 p-2 shadow-elev-3">
            {results.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm font-semibold text-fg">Nada encontrado para “{query.trim()}”</p>
                <p className="mt-1 text-xs text-text-mute">
                  Tente outro termo — ou fale com a gente pela página de contato.
                </p>
              </div>
            ) : (
              <ul id={listboxId} role="listbox" aria-label="Resultados da busca">
                {results.map((doc, i) => (
                  <li key={`${doc.audience}-${doc.id}`} role="option" aria-selected={i === cursor}>
                    <Link
                      href={`/docs/${doc.audience}#${doc.id}`}
                      onClick={() => {
                        setOpen(false);
                        setQuery('');
                      }}
                      onMouseEnter={() => setCursor(i)}
                      className={`block w-full cursor-pointer rounded-3 px-4 py-3 text-left transition-colors duration-150 ${
                        i === cursor ? 'bg-surface-2' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-bold tracking-tight text-fg">{doc.title}</span>
                        <span
                          className={`rounded-pill px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${AUDIENCE_TONE[doc.audience]}`}
                        >
                          {doc.audienceLabel}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-text-mute">{doc.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {showPanel ? `${results.length} resultados` : ''}
      </p>
    </div>
  );
}
