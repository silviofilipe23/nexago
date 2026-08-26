import { Directive, computed, input } from '@angular/core';

export type NxButtonVariant = 'primary' | 'secondary';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-pill font-semibold ' +
  'min-h-[48px] px-6 text-[15px] tracking-tight transition-all duration-200 ease-out ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-bg cursor-pointer select-none';

const VARIANTS: Record<NxButtonVariant, string> = {
  primary: 'bg-brand text-on-brand shadow-glow-orange hover:bg-brand-light active:bg-brand-dark active:scale-[0.98]',
  secondary: 'bg-surface-1 text-fg border border-line-strong hover:border-brand hover:text-brand active:scale-[0.98]',
};

/**
 * Porta de `Button`/`ButtonLink` (site Next.js) como directive de atributo, aplicável tanto
 * em `<button nxButton type="button">` quanto em `<a nxButton routerLink="...">`. Uso:
 * `<a nxButton="secondary" ...>` ou como atributo puro `<a nxButton ...>` (vira "primary" —
 * o transform trata a string vazia que o Angular liga pro atributo sem valor). Botões nativos
 * precisam declarar `type="button"` no template.
 */
@Directive({
  selector: '[nxButton]',
  host: {
    '[class]': 'classes()',
  },
})
export class ButtonDirective {
  readonly variant = input<NxButtonVariant, NxButtonVariant | ''>('primary', {
    alias: 'nxButton',
    transform: (value) => (value === '' ? 'primary' : value),
  });

  protected readonly classes = computed(() => `${BASE} ${VARIANTS[this.variant()]}`);
}
