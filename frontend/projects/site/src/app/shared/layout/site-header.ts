import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from '../ui/button.directive';
import { ThemeToggle } from '../ui/theme-toggle';

interface NavItem {
  label: string;
  href: string;
}

interface PersonaItem extends NavItem {
  description: string;
  external: boolean;
}

const NAV: NavItem[] = [
  { label: 'Ligas', href: '/ligas' },
  { label: 'Torneios', href: '/torneios' },
  { label: 'Rankings', href: '/rankings' },
  { label: 'Docs', href: '/docs' },
];

const PERSONAS: PersonaItem[] = [
  { label: 'Atletas', href: 'https://linktr.ee/nexago', description: 'Competir, ranquear e reservar quadra', external: true },
  { label: 'Organizadores', href: '/organizadores', description: 'Gerir torneios sem planilha', external: false },
  { label: 'Arenas', href: '/arenas', description: 'Encher as quadras e receber etapas', external: false },
];

/**
 * Porta de `SiteHeader` (site Next.js). Diferenças do original:
 * - Sem os checks `typeof window` (lá eram pra compat SSR; aqui o app é CSR puro).
 * - O painel mobile usa um padrão mount→rAF→visible (dois signals) pra ter entrada E saída
 *   animadas via CSS puro, no lugar do `AnimatePresence` do Framer Motion.
 */
@Component({
  selector: 'app-site-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonDirective, ThemeToggle],
  templateUrl: './site-header.html',
  host: {
    '(window:scroll)': 'onScroll()',
    '(document:keydown.escape)': 'onEscape()',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class SiteHeader {
  protected readonly nav = NAV;
  protected readonly personas = PERSONAS;

  protected readonly compact = signal(false);
  protected readonly hidden = signal(false);
  protected readonly menuMounted = signal(false);
  protected readonly menuVisible = signal(false);
  protected readonly personaOpen = signal(false);

  protected readonly isHidden = computed(() => this.hidden() && !this.menuMounted());

  protected readonly headerClasses = computed(() => {
    const compact = this.compact();
    const hidden = this.isHidden();
    return [
      'fixed inset-x-0 top-0 z-[60] px-4 transition-all duration-300 ease-out motion-reduce:transition-none',
      compact ? 'pt-2' : 'pt-4',
      hidden ? '-translate-y-[150%] opacity-0' : 'translate-y-0 opacity-100',
    ].join(' ');
  });

  protected readonly pillClasses = computed(() => {
    const compact = this.compact();
    return [
      'mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-pill border border-line bg-glass backdrop-blur-md backdrop-saturate-150 transition-all duration-300 ease-out motion-reduce:transition-none',
      compact ? 'h-12 px-4 shadow-elev-3' : 'h-14 px-5 shadow-elev-2',
    ].join(' ');
  });

  protected readonly menuClipPath = computed(() => (this.menuVisible() ? 'inset(0% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)'));
  protected readonly menuOpacity = computed(() => (this.menuVisible() ? 1 : 0));

  private readonly personaMenuRef = viewChild<ElementRef<HTMLElement>>('personaMenu');
  private readonly closeButtonRef = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  private lastY = window.scrollY;
  private rafId = 0;
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.rafId));
  }

  protected onScroll(): void {
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => {
      const y = window.scrollY;
      this.compact.set(y > 24);
      if (y < 80) {
        this.hidden.set(false);
      } else if (Math.abs(y - this.lastY) > 6 && !this.reduceMotion) {
        this.hidden.set(y > this.lastY);
      }
      this.lastY = y;
    });
  }

  protected onEscape(): void {
    this.personaOpen.set(false);
    if (this.menuMounted()) {
      this.closeMenu();
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.personaOpen()) return;
    const el = this.personaMenuRef()?.nativeElement;
    if (el && !el.contains(event.target as Node)) {
      this.personaOpen.set(false);
    }
  }

  protected togglePersona(): void {
    this.personaOpen.update((open) => !open);
  }

  protected closePersona(): void {
    this.personaOpen.set(false);
  }

  protected openMenu(): void {
    this.menuMounted.set(true);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      this.menuVisible.set(true);
      setTimeout(() => this.closeButtonRef()?.nativeElement.focus(), 0);
    });
  }

  protected closeMenu(): void {
    this.menuVisible.set(false);
    document.body.style.overflow = '';
    setTimeout(() => this.menuMounted.set(false), this.reduceMotion ? 150 : 420);
  }
}
