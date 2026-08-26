import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Resolve `DocFeature.icon` (nome kebab-case, ex.: `'calendar-clock'`) num SVG desenhado à mão
 * — este app não tem pacote de ícones (source usava componentes Lucide diretos). Cobre os nomes
 * derivados dos componentes Lucide usados em `lib/docs/{arenas,atletas,organizadores}.tsx`
 * (PascalCase → kebab-case, ex.: `CalendarClock` → `'calendar-clock'`). Nome desconhecido cai no
 * ícone genérico (círculo com ponto) em vez de quebrar a tela — a busca de nome entre este
 * arquivo e os dados do outro agente é determinística, mas não é garantida (nenhum acoplamento
 * de build entre os dois).
 */
@Component({
  selector: 'app-doc-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  templateUrl: './doc-icon.html',
})
export class DocIcon {
  readonly name = input.required<string>();
  readonly size = input('size-5');
}
