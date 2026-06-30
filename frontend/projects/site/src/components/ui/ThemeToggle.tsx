'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';

/**
 * Alterna tema claro/escuro. O tema é aplicado antes do paint pelo script inline
 * do layout (sem flash); aqui só lemos o estado atual e persistimos a escolha.
 * Default dark (marca dark-first). Ícone: Sol no escuro (ação = clarear),
 * Lua no claro (ação = escurecer).
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  // null até montar: SSR e 1º render do cliente batem (evita mismatch de hidratação).
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // localStorage indisponível (modo privado) — só não persiste.
    }
    // Acompanha a cor da barra do navegador (mobile).
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'light' ? '#f4f4f3' : '#050505');
    setTheme(next);
  }

  const isLight = theme === 'light';
  const label = isLight ? 'Ativar tema escuro' : 'Ativar tema claro';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`inline-flex size-9 items-center justify-center rounded-full border border-line text-text-mute transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none ${className}`}
    >
      {/* Antes de montar (theme=null) renderiza o Sol — coerente com o default dark. */}
      {isLight ? (
        <Moon className="size-[18px]" aria-hidden="true" />
      ) : (
        <Sun className="size-[18px]" aria-hidden="true" />
      )}
    </button>
  );
}
