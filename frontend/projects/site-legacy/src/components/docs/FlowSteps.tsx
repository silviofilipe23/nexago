import type { ChipTone, DocFlow } from '@/lib/docs/types';

const chipClasses: Record<ChipTone, string> = {
  brand: 'text-brand bg-brand-tint',
  pending: 'text-pending bg-pending/12',
  live: 'text-live bg-live/12',
  win: 'text-win bg-win/12',
  neutral: 'text-text-mute bg-surface-2',
};

/**
 * Fluxo passo a passo — trilho numerado no vocabulário do produto: numerais
 * mono, linha conectora e chips de estado iguais aos do app ("Pagamento
 * pendente", "Aguardando parceiro"…).
 */
export function FlowSteps({ flow }: { flow: DocFlow }) {
  return (
    <div className="rounded-4 border border-line bg-surface-0 p-5 sm:p-6">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Fluxo</p>
      <h4 className="mt-1.5 font-display text-lg font-bold tracking-tight text-fg">{flow.title}</h4>
      {flow.intro && <p className="mt-2 text-sm leading-relaxed text-text-mute">{flow.intro}</p>}

      <ol className="mt-5">
        {flow.steps.map((step, i) => {
          const last = i === flow.steps.length - 1;
          return (
            <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0">
              {!last && <span className="absolute left-[13px] top-8 bottom-0 w-px bg-line" aria-hidden="true" />}
              <span
                className="z-[1] inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-brand/40 bg-surface-1 font-mono text-xs font-bold text-brand"
                aria-hidden="true"
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 pt-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h5 className="text-[15px] font-bold tracking-tight text-fg">{step.title}</h5>
                  {step.state && (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${chipClasses[step.state.tone ?? 'neutral']}`}
                    >
                      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                      {step.state.label}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-text-mute">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {flow.outcome && (
        <p className="mt-5 rounded-3 border border-win/25 bg-win/8 px-4 py-3 text-sm leading-relaxed text-text-mute">
          <span className="mr-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-win">Resultado</span>
          {flow.outcome}
        </p>
      )}
    </div>
  );
}
