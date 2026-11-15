import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Abas do app, na ordem em que aparecem no pé da tela (traços no estilo lucide). */
const TABS = [
  { label: 'Início', icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z' },
  { label: 'Agenda', icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z' },
  { label: 'Reservar', icon: 'M12 8v8M8 12h8M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z' },
  {
    label: 'Competir',
    icon: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17c0 .6-.5 1-1 1.2-1.2.5-2 2-2 3.8M14 14.7V17c0 .6.5 1 1 1.2 1.2.5 2 2 2 3.8M18 2H6v7a6 6 0 0 0 12 0V2Z',
  },
  {
    label: 'Comunidade',
    icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  },
] as const;

export type AppTab = (typeof TABS)[number]['label'];

/**
 * O que toda tela do app tem em volta: a barra de status em cima e as abas embaixo. A tela em
 * si entra por projeção e ocupa o meio (`flex-1`). Vai dentro de um `app-phone-frame`, e por
 * isso mede tudo em `cqw`, como o conteúdo.
 */
@Component({
  selector: 'app-phone-app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full flex-col font-sans text-fg' },
  template: `
    <div class="flex items-center justify-between px-[7cqw] pt-[5.2cqw] text-[3.7cqw] font-600">
      <span>{{ time() }}</span>
      <span class="flex items-center gap-[1.4cqw]">
        <span class="h-[2.6cqw] w-[4cqw] rounded-[0.6cqw] bg-fg/90"></span>
        <span class="h-[2.6cqw] w-[5.6cqw] rounded-[0.9cqw] border border-fg/60 p-[0.3cqw]">
          <span class="block h-full w-3/4 rounded-[0.4cqw] bg-fg/90"></span>
        </span>
      </span>
    </div>

    <ng-content />

    <div class="mx-[5.5cqw] mb-[5cqw] mt-[4cqw] flex items-center justify-between rounded-full border border-line bg-surface-1 px-[5cqw] py-[2.6cqw] text-text-mute">
      @for (tab of tabs; track tab.label) {
        <span class="flex flex-col items-center gap-[0.8cqw] text-[2.5cqw]" [class.text-brand]="tab.label === active()">
          <svg class="size-[5.2cqw]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path [attr.d]="tab.icon" />
          </svg>
          {{ tab.label }}
        </span>
      }
    </div>
  `,
})
export class PhoneAppShell {
  /** Hora na barra de status. */
  readonly time = input.required<string>();
  /** Aba em que a tela mostrada mora. */
  readonly active = input.required<AppTab>();

  protected readonly tabs = TABS;
}
