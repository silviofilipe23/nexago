import Image from 'next/image';
import type { CSSProperties } from 'react';
import type { ChipTone, DocScreen, MockBlock, MockChip, MockScreen } from '@/lib/docs/types';

/*
 * Cores fixas do produto retratado nos mocks. Como um screenshot, a ilustração
 * mostra o app/painel dark-first e NÃO acompanha o tema claro do site — por
 * isso hex cru aqui, e somente aqui.
 */
const M = {
  bg: '#0b0b0c',
  surface: '#17171a',
  surface2: '#212126',
  line: 'rgba(255,255,255,0.09)',
  fg: '#f4f4f5',
  mute: 'rgba(244,244,245,0.62)',
  dim: 'rgba(244,244,245,0.42)',
  brand: '#ff6a1a',
  onBrand: '#0a0a0a',
  pending: '#f4c543',
  live: '#ff5a4e',
  win: '#2bd17e',
} as const;

const toneColor: Record<ChipTone, string> = {
  brand: M.brand,
  pending: M.pending,
  live: M.live,
  win: M.win,
  neutral: M.mute,
};

function Chip({ chip }: { chip: MockChip }) {
  const color = toneColor[chip.tone ?? 'neutral'];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[7px] font-semibold uppercase tracking-wider"
      style={{ color, borderColor: 'transparent', backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <span className="size-1 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {chip.label}
    </span>
  );
}

function MiniBracket() {
  return (
    <svg viewBox="0 0 220 96" className="w-full" aria-hidden="true">
      {[0, 26, 52, 78].map((y) => (
        <rect key={y} x="2" y={y} width="56" height="16" rx="4" fill={M.surface2} />
      ))}
      {[13, 65].map((y) => (
        <rect key={y} x="92" y={y} width="56" height="16" rx="4" fill={M.surface2} />
      ))}
      <rect x="162" y="39" width="56" height="16" rx="4" fill={M.brand} opacity="0.9" />
      <path
        d="M58 8h14v26h20M58 34h14M58 60h14v26h20M58 86h14M148 21h7v26h7M148 73h7v-26"
        stroke={M.line}
        strokeWidth="1.5"
        fill="none"
      />
      {[4, 30, 56, 82].map((y, i) => (
        <rect key={y} x="6" y={y} width={[38, 30, 34, 26][i]} height="7" rx="3.5" fill={M.dim} opacity="0.5" />
      ))}
      {[17, 69].map((y, i) => (
        <rect key={y} x="96" y={y} width={[34, 30][i]} height="7" rx="3.5" fill={M.mute} opacity="0.6" />
      ))}
      <rect x="166" y="43" width="36" height="7" rx="3.5" fill={M.onBrand} opacity="0.8" />
    </svg>
  );
}

function MiniCalendar() {
  const filled = new Set([9, 12, 16, 23, 24]);
  return (
    <div className="grid grid-cols-7 gap-1" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <div
          key={i}
          className="aspect-square rounded-[3px]"
          style={{ backgroundColor: filled.has(i) ? M.brand : M.surface2, opacity: filled.has(i) ? 0.9 : 1 }}
        />
      ))}
    </div>
  );
}

function MiniPix() {
  const cells = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20, 22, 24];
  return (
    <div className="flex items-center gap-3 rounded-lg p-2.5" style={{ backgroundColor: M.surface }}>
      <div className="grid size-12 shrink-0 grid-cols-5 gap-[2px] rounded-[4px] bg-white p-1" aria-hidden="true">
        {Array.from({ length: 25 }, (_, i) => (
          <div key={i} className="rounded-[1px]" style={{ backgroundColor: cells.includes(i) ? '#0a0a0a' : 'transparent' }} />
        ))}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-1.5 w-3/4 rounded-full" style={{ backgroundColor: M.mute, opacity: 0.5 }} />
        <div className="h-1.5 w-1/2 rounded-full" style={{ backgroundColor: M.dim, opacity: 0.5 }} />
        <div
          className="inline-block rounded-full px-2 py-0.5 font-mono text-[7px] font-semibold uppercase tracking-wider"
          style={{ backgroundColor: `color-mix(in srgb, ${M.brand} 16%, transparent)`, color: M.brand }}
        >
          Copiar código
        </div>
      </div>
    </div>
  );
}

function Block({ block, wide }: { block: MockBlock; wide: boolean }) {
  switch (block.kind) {
    case 'banner':
      return (
        <div className="rounded-xl p-3" style={{ backgroundColor: M.brand }}>
          <p className="text-[11px] font-extrabold leading-tight tracking-tight" style={{ color: M.onBrand }}>
            {block.title}
          </p>
          {block.sub && (
            <p className="mt-0.5 text-[8px] font-medium" style={{ color: M.onBrand, opacity: 0.75 }}>
              {block.sub}
            </p>
          )}
          {block.cta && (
            <span
              className="mt-2 inline-block rounded-full px-2.5 py-1 text-[8px] font-bold"
              style={{ backgroundColor: M.onBrand, color: M.fg }}
            >
              {block.cta}
            </span>
          )}
        </div>
      );
    case 'stats':
      return (
        <div className={`grid gap-1.5 ${wide ? 'grid-cols-4' : block.items.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {block.items.map((s) => (
            <div key={s.label} className="rounded-lg p-2" style={{ backgroundColor: M.surface }}>
              <p className="font-mono text-[6.5px] uppercase tracking-wider" style={{ color: M.dim }}>
                {s.label}
              </p>
              <p className="mt-0.5 text-[12px] font-bold" style={{ color: M.fg }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      );
    case 'row':
      return (
        <div className="flex items-center gap-2 rounded-lg p-2" style={{ backgroundColor: M.surface }}>
          <div className="size-6 shrink-0 rounded-md" style={{ backgroundColor: `color-mix(in srgb, ${M.brand} 18%, transparent)` }} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[9px] font-bold" style={{ color: M.fg }}>
              {block.title}
            </p>
            {block.sub && (
              <p className="truncate text-[7.5px]" style={{ color: M.mute }}>
                {block.sub}
              </p>
            )}
          </div>
          {block.chip && <Chip chip={block.chip} />}
        </div>
      );
    case 'score':
      return (
        <div className="rounded-lg p-2.5" style={{ backgroundColor: M.surface }}>
          {block.live && (
            <p className="mb-1.5 flex items-center gap-1 font-mono text-[7px] font-semibold uppercase tracking-wider" style={{ color: M.live }}>
              <span className="size-1 rounded-full" style={{ backgroundColor: M.live }} aria-hidden="true" />
              Ao vivo
            </p>
          )}
          {[
            { name: block.teamA, idx: 0 as const },
            { name: block.teamB, idx: 1 as const },
          ].map((team) => (
            <div key={team.idx} className="flex items-center justify-between gap-2 py-1">
              <p className="truncate text-[9px] font-semibold" style={{ color: M.fg }}>
                {team.name}
              </p>
              <div className="flex gap-1">
                {block.sets.map((set, i) => {
                  const mine = set[team.idx];
                  const other = set[1 - team.idx];
                  const winning = Number(mine) > Number(other);
                  return (
                    <span
                      key={i}
                      className="inline-flex size-5 items-center justify-center rounded font-mono text-[9px] font-bold"
                      style={{
                        backgroundColor: winning ? `color-mix(in srgb, ${M.brand} 22%, transparent)` : M.surface2,
                        color: winning ? M.brand : M.mute,
                      }}
                    >
                      {mine}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    case 'button':
      return (
        <div className="rounded-full py-2 text-center text-[9px] font-bold" style={{ backgroundColor: M.brand, color: M.onBrand }}>
          {block.label}
        </div>
      );
    case 'field':
      return (
        <div>
          <p className="mb-1 font-mono text-[6.5px] uppercase tracking-wider" style={{ color: M.dim }}>
            {block.label}
          </p>
          <div className="rounded-lg border px-2 py-1.5 text-[8.5px]" style={{ borderColor: M.line, color: block.value ? M.fg : M.dim, backgroundColor: M.surface }}>
            {block.value ?? '—'}
          </div>
        </div>
      );
    case 'bracket':
      return <MiniBracket />;
    case 'calendar':
      return (
        <div>
          {block.label && (
            <p className="mb-1.5 font-mono text-[6.5px] uppercase tracking-wider" style={{ color: M.dim }}>
              {block.label}
            </p>
          )}
          <MiniCalendar />
        </div>
      );
    case 'search':
      return (
        <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5" style={{ backgroundColor: M.surface }}>
          <svg viewBox="0 0 24 24" className="size-2.5" fill="none" stroke={M.dim} strokeWidth="3" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="text-[8px]" style={{ color: M.dim }}>
            {block.placeholder}
          </span>
        </div>
      );
    case 'tabs':
      return (
        <div className="flex gap-1.5 overflow-hidden">
          {block.items.map((t, i) => {
            const active = i === (block.active ?? 0);
            return (
              <span
                key={t}
                className="shrink-0 rounded-full px-2 py-1 text-[8px] font-semibold"
                style={active ? { backgroundColor: M.brand, color: M.onBrand } : { backgroundColor: M.surface, color: M.mute }}
              >
                {t}
              </span>
            );
          })}
        </div>
      );
    case 'pix':
      return <MiniPix />;
    case 'heading':
      return (
        <p className="pt-1 font-mono text-[7px] font-semibold uppercase tracking-[0.18em]" style={{ color: M.dim }}>
          {block.label}
        </p>
      );
  }
}

const NAV_ITEMS = ['Início', 'Agenda', 'Reservar', 'Competir', 'Comunidade'] as const;

function MockBody({ screen, wide }: { screen: MockScreen; wide: boolean }) {
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: M.bg }}>
      <div className={`flex-1 space-y-2 overflow-hidden ${wide ? 'p-4' : 'p-3 pt-4'}`}>
        <div>
          {screen.eyebrow && (
            <p className="font-mono text-[7px] font-semibold uppercase tracking-[0.18em]" style={{ color: M.brand }}>
              {screen.eyebrow}
            </p>
          )}
          <p className={`font-bold leading-tight tracking-tight ${wide ? 'text-[14px]' : 'text-[13px]'}`} style={{ color: M.fg }}>
            {screen.title}
          </p>
          {screen.chips && screen.chips.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {screen.chips.map((c) => (
                <Chip key={c.label} chip={c} />
              ))}
            </div>
          )}
        </div>
        {wide ? (
          <div className="grid grid-cols-2 gap-2 [&>*:only-child]:col-span-2">
            {screen.blocks.map((b, i) => (
              <div key={i} className={b.kind === 'bracket' || b.kind === 'stats' || b.kind === 'tabs' || b.kind === 'heading' || b.kind === 'search' ? 'col-span-2' : ''}>
                <Block block={b} wide />
              </div>
            ))}
          </div>
        ) : (
          screen.blocks.map((b, i) => <Block key={i} block={b} wide={false} />)
        )}
      </div>
      {screen.bottomNav && !wide && (
        <div className="mx-3 mb-3 flex items-center justify-between rounded-full px-3 py-1.5" style={{ backgroundColor: M.surface }}>
          {NAV_ITEMS.map((item) => (
            <span
              key={item}
              className="text-[6px] font-semibold"
              style={{ color: item === screen.bottomNav ? M.brand : M.dim }}
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[240px] rounded-[2.4rem] border p-[6px] shadow-elev-3" style={{ borderColor: '#26262b', backgroundColor: '#0c0c0e' }}>
      <div className="overflow-hidden rounded-[2rem]">{children}</div>
    </div>
  );
}

function BrowserShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-hidden rounded-3 border shadow-elev-2" style={{ borderColor: '#26262b', backgroundColor: '#0c0c0e' }}>
      <div className="flex items-center gap-1.5 border-b px-3 py-2" style={{ borderColor: M.line }}>
        {['#3a3a40', '#3a3a40', '#3a3a40'].map((c, i) => (
          <span key={i} className="size-2 rounded-full" style={{ backgroundColor: c }} aria-hidden="true" />
        ))}
        <span className="ml-2 rounded-full px-2.5 py-0.5 font-mono text-[8px]" style={{ backgroundColor: M.surface, color: M.dim }}>
          nexago.com.br
        </span>
      </div>
      {children}
    </div>
  );
}

/**
 * Figura de tela de uma feature: screenshot real (image) ou ilustração
 * esquemática (mock) dentro de moldura de celular/navegador.
 */
export function ScreenFigure({ screen, caption }: { screen: DocScreen; caption?: string }) {
  const label =
    caption ?? (screen.kind === 'image' ? 'Tela real do app nexaGO' : 'Ilustração esquemática da tela');

  return (
    <figure className="w-full">
      {screen.kind === 'image' ? (
        <PhoneShell>
          <Image src={screen.src} alt={screen.alt} width={1179} height={2556} sizes="(max-width: 1024px) 70vw, 240px" className="h-auto w-full" />
        </PhoneShell>
      ) : screen.frame === 'phone' ? (
        <PhoneShell>
          <div className="aspect-[9/17.5]" role="img" aria-label={screen.alt}>
            <MockBody screen={screen.screen} wide={false} />
          </div>
        </PhoneShell>
      ) : (
        <BrowserShell>
          <div role="img" aria-label={screen.alt}>
            <MockBody screen={screen.screen} wide />
          </div>
        </BrowserShell>
      )}
      <figcaption className="mt-3 text-center font-mono text-[11px] uppercase tracking-wider text-text-dim">
        {label}
      </figcaption>
    </figure>
  );
}
