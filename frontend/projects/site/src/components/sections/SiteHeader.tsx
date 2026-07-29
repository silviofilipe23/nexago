'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, Download, Menu, X } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const NAV = [
  { label: 'Ligas', href: '/ligas' },
  { label: 'Torneios', href: '/torneios' },
  { label: 'Rankings', href: '/rankings' },
];

const PERSONAS = [
  { label: 'Atletas', href: 'https://linktr.ee/nexago', description: 'Competir, ranquear e reservar quadra' },
  { label: 'Organizadores', href: '/organizadores', description: 'Gerir torneios sem planilha' },
  { label: 'Arenas', href: '/arenas', description: 'Encher as quadras e receber etapas' },
];

function Logo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 rounded-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      aria-label="nexaGO — início"
    >
      <Image src="/brand/logo.png" alt="" width={32} height={32} priority className="size-8" />
      <span className="font-display text-lg font-bold tracking-tight text-fg">
        nexa<span className="text-brand">GO</span>
      </span>
    </Link>
  );
}

function PersonaMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm font-500 text-text-mute transition-colors duration-200 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:rounded-2"
      >
        Para você
        <ChevronDown
          className={`size-4 transition-transform duration-200 ${open ? 'rotate-180' : ''} motion-reduce:transition-none`}
          aria-hidden="true"
        />
      </button>

      {open && (
        // pt-3 cria a "ponte" hoverável entre o botão e o menu (sem gap vazio que fecharia o dropdown).
        <div className="absolute left-1/2 top-full z-10 w-72 -translate-x-1/2 pt-3">
          <div
            role="menu"
            aria-label="Para você"
            className="rounded-4 border border-line bg-surface-1 p-2 shadow-elev-2"
          >
            {PERSONAS.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
              >
                <span className="block text-sm font-700 tracking-tight text-fg">{p.label}</span>
                <span className="mt-0.5 block text-xs text-text-mute">{p.description}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  const reduce = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      // Desdobra a partir da barra (topo) ao abrir; recolhe de volta ao fechar (modal-motion).
      initial={reduce ? { opacity: 0 } : { opacity: 0, clipPath: 'inset(0% 0% 100% 0%)' }}
      animate={{ opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, clipPath: 'inset(0% 0% 100% 0%)' }}
      transition={reduce ? { duration: 0.15 } : { duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[70] bg-bg px-6 pt-6 md:hidden"
    >
      <div className="flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="inline-flex size-11 items-center justify-center rounded-3 text-fg transition-colors hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="size-6" aria-hidden="true" />
          </button>
        </div>
      </div>

      <nav aria-label="Menu principal" className="mt-10 flex flex-col">
        <p className="mb-3 font-mono text-xs font-600 uppercase tracking-[0.2em] text-text-dim">Para você</p>
        {PERSONAS.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            onClick={onClose}
            className="-mx-3 rounded-3 px-3 py-3 transition-colors hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:outline-none"
          >
            <span className="block font-display text-lg font-700 tracking-tight text-fg">{p.label}</span>
            <span className="mt-0.5 block text-sm text-text-mute">{p.description}</span>
          </Link>
        ))}

        <span className="my-5 h-px bg-line" aria-hidden="true" />

        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className="-mx-3 rounded-3 px-3 py-3 font-display text-lg font-700 tracking-tight text-fg transition-colors hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:outline-none"
          >
            {item.label}
          </Link>
        ))}

        <ButtonLink href="https://linktr.ee/nexago" onClick={onClose} className="mt-8 w-full">
          Baixar o app
        </ButtonLink>
      </nav>
    </motion.div>
  );
}

export function SiteHeader() {
  const [hidden, setHidden] = useState(false);
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Esconde ao rolar para baixo, reaparece ao rolar para cima; compacta a pílula fora do topo.
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lastY = window.scrollY;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        setCompact(y > 24);
        if (y < 80) {
          setHidden(false);
        } else if (Math.abs(y - lastY) > 6 && !reduce) {
          setHidden(y > lastY); // descendo esconde, subindo mostra
        }
        lastY = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Garante o header visível enquanto o menu mobile estiver aberto.
  const isHidden = hidden && !menuOpen;

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-[60] px-4 transition-all duration-300 ease-out motion-reduce:transition-none ${
          compact ? 'pt-2' : 'pt-4'
        } ${isHidden ? '-translate-y-[150%] opacity-0' : 'translate-y-0 opacity-100'}`}
        aria-hidden={isHidden}
      >
        <div
          className={`mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-pill border border-line bg-glass backdrop-blur-md backdrop-saturate-150 transition-all duration-300 ease-out motion-reduce:transition-none ${
            compact ? 'h-12 px-4 shadow-elev-3' : 'h-14 px-5 shadow-elev-2'
          }`}
        >
          <Logo />

          <nav aria-label="Principal" className="hidden items-center gap-7 md:flex">
            <PersonaMenu />
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-500 text-text-mute transition-colors duration-200 hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menu"
              aria-expanded={menuOpen}
              className={`min-h-0 text-sm bg-brand font-sora font-bold text-on-brand shadow-glow-orange hover:bg-brand-light active:bg-brand-dark active:scale-[0.98] rounded-pill px-4 py-2 transition-all duration-300 ease-out motion-reduce:transition-none
               `}
            >
              Baixar o app
            </button>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <Link
              href="https://linktr.ee/nexago"
              className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-brand px-3.5 font-sora text-[13px] font-bold tracking-tight text-on-brand shadow-glow-orange transition-all duration-200 ease-out hover:bg-brand-light active:scale-[0.98] active:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
            >
              <Download className="size-4" aria-hidden="true" />
              Baixar
            </Link>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menu"
              aria-expanded={menuOpen}
              className="inline-flex size-11 items-center justify-center rounded-3 text-fg transition-colors hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Menu className="size-6" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Fora do <header> (que tem transform) para o overlay cobrir a viewport corretamente. */}
      <AnimatePresence>{menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}</AnimatePresence>
    </>
  );
}
