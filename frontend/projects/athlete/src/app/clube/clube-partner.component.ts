import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { ClubeLeadModalComponent } from './clube-lead-modal.component';
import { ClubePartnerLogoComponent } from './clube-partner-logo.component';
import {
  athleteCode,
  brandTextTone,
  couponFor,
  ctaHint,
  emphasize,
  heroLine,
  howToUseSteps,
  isLocked,
  lockLabel,
  LOCKED_BENEFIT_NOTICE,
  parseClubSource,
  trackedPartnerUrl,
} from './clube.logic';
import { ClubStore } from './data/clube.store';

/** Quanto tempo o botão fica em "Copiado" antes de voltar a "Copiar". */
const COPIED_MS = 2500;

type CopyState = 'idle' | 'copied' | 'failed';

/** Copia pelo Clipboard API e, se o navegador negar, pelo `execCommand` (Safari antigo, http). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

/**
 * `/clube/:partnerId`: hero na cor da marca (com a capa, se houver), benefício, "Como usar", termos
 * e o card lateral com o cupom e o botão. Link abre o site do parceiro (nova aba, marcado);
 * formulário abre o modal. Parceiro com requisito fica bloqueado: sem cupom, sem botão, sem "Como
 * usar" e sem eventos de uso; o benefício sai só no app.
 */
@Component({
  selector: 'app-clube-partner',
  imports: [RouterLink, AtPanelShellComponent, ClubePartnerLogoComponent, ClubeLeadModalComponent],
  templateUrl: './clube-partner.component.html',
  styleUrl: './clube-partner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClubePartnerComponent {
  protected readonly store = inject(ClubStore);
  private readonly route = inject(ActivatedRoute);

  /** A origem com que a pessoa entrou no clube; volta junto para a lista. */
  protected readonly source = parseClubSource(this.route.snapshot.queryParamMap.get('origem'));
  protected readonly linkQuery = { origem: this.source };

  private readonly partnerId = toSignal(this.route.paramMap.pipe(map((p) => p.get('partnerId') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('partnerId') ?? '',
  });

  protected readonly partner = computed(() => this.store.partner(this.partnerId()));
  protected readonly locked = computed(() => {
    const p = this.partner();
    return !!p && isLocked(p);
  });
  protected readonly lockText = computed(() => {
    const p = this.partner();
    return p ? lockLabel(p) : '';
  });
  protected readonly lockedNotice = LOCKED_BENEFIT_NOTICE;
  protected readonly darkText = computed(() => {
    const p = this.partner();
    return !!p && brandTextTone(p.brandColor) === 'dark';
  });
  protected readonly coupon = computed(() => {
    const p = this.partner();
    return p ? couponFor(p, this.store.uid()) : null;
  });
  protected readonly ctaUrl = computed(() => {
    const p = this.partner();
    const uid = this.store.uid();
    return p?.ctaType === 'link' && uid && !isLocked(p) ? trackedPartnerUrl(p.link, athleteCode(uid)) : null;
  });
  protected readonly steps = computed(() => {
    const p = this.partner();
    if (!p || isLocked(p)) return [];
    const coupon = this.coupon();
    return howToUseSteps(p, coupon).map((step) => emphasize(step, [p.ctaLabel, coupon]));
  });
  protected readonly heroLine = computed(() => {
    const p = this.partner();
    return p ? heroLine(p) : '';
  });
  protected readonly hint = computed(() => {
    const p = this.partner();
    if (!p) return '';
    if (p.ctaType === 'link' && !this.ctaUrl()) return 'Link do parceiro indisponível no momento.';
    return ctaHint(p);
  });

  protected readonly copyState = signal<CopyState>('idle');
  protected readonly leadOpen = signal(false);

  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private viewedId: string | null = null;

  constructor() {
    this.store.ensureLoaded();
    // `partner_view` uma vez por parceiro aberto, só depois de saber que ele está na vitrine.
    effect(() => {
      const p = this.partner();
      if (!p || p.id === this.viewedId) return;
      this.viewedId = p.id;
      untracked(() => this.store.track('partner_view', this.source, p.id));
    });
    inject(DestroyRef).onDestroy(() => this.clearCopyTimer());
  }

  protected async copyCoupon(): Promise<void> {
    const p = this.partner();
    const code = this.coupon();
    if (!p || !code || isLocked(p)) return;
    const focused = document.activeElement as HTMLElement | null;
    const copied = await copyText(code);
    focused?.focus();
    if (!copied) {
      // Fica na tela até a próxima tentativa: o atleta precisa ler para copiar à mão.
      this.clearCopyTimer();
      this.copyState.set('failed');
      return;
    }
    this.store.track('code_copy', this.source, p.id);
    this.clearCopyTimer();
    this.copyState.set('copied');
    this.copyTimer = setTimeout(() => this.copyState.set('idle'), COPIED_MS);
  }

  /** Link: o `<a>` abre a nova aba sozinho; aqui só conta o clique. */
  protected onLinkClick(): void {
    const p = this.partner();
    if (p && !isLocked(p)) this.store.track('cta_click', this.source, p.id);
  }

  protected openLead(): void {
    const p = this.partner();
    if (!p || isLocked(p)) return;
    this.store.track('cta_click', this.source, p.id);
    this.leadOpen.set(true);
  }

  protected closeLead(): void {
    this.leadOpen.set(false);
  }

  protected retry(): void {
    void this.store.reload();
  }

  private clearCopyTimer(): void {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = null;
  }
}
