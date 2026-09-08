import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { environment } from '../../../environments/environment';
import { athleteFunctions } from '../../data/functions';

/** Mesma fábrica local das outras telas do portal — o projeto não tem um provider único. */
function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** A callable escreve mensagens legíveis de propósito; o genérico é só a rede caindo. */
function claimErrorMessage(err: unknown): string {
  const message = (err as { message?: unknown })?.message;
  return typeof message === 'string' && message.trim()
    ? message.trim()
    : 'Não foi possível pegar a vaga. Tente de novo.';
}

interface SpotPassLinkPreview {
  tournamentName: string;
  categoryLabel: string;
  remaining: number;
  total: number;
  status: string;
}

/** Resgate de uma vaga liberada por link.
 *
 *  O organizador manda UM link no grupo e as primeiras pessoas que abrirem ficam com as vagas.
 *  Resgatar não inscreve ninguém: cria o direito de se inscrever numa categoria lotada. Por isso
 *  a tela termina mandando para o fluxo normal de inscrição — é lá que a vaga vira inscrição, e
 *  o teto da categoria só sobe naquele momento.
 *
 *  A recusa aqui precisa dizer o MOTIVO. No caminho nominal quem descobre o impedimento é o
 *  organizador, na hora de liberar; aqui é o atleta, ao abrir um link que alguém mandou — e
 *  "erro" o deixaria sem saber se tenta de novo ou se a vaga não era para ele. */
@Component({
  selector: 'app-spot-pass-claim',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="sp">
      <section class="sp-card">
        @if (loading()) {
          <p class="sp-dim">Carregando a vaga…</p>
        } @else if (preview(); as p) {
          <p class="sp-eyebrow">Vaga liberada</p>
          <h1>{{ p.categoryLabel }}</h1>
          <p class="sp-sub">{{ p.tournamentName }}</p>

          @if (soldOut()) {
            <p class="sp-warn">
              As vagas deste link acabaram. Fale com o organizador do torneio.
            </p>
          } @else {
            <p class="sp-count">
              {{ p.remaining }} de {{ p.total }} {{ p.total === 1 ? 'vaga' : 'vagas' }} ainda
              disponíveis
            </p>
            <p class="sp-body">
              Pegar a vaga não conclui sua inscrição: você segue para o fluxo normal, convida seu
              parceiro e paga pelo app. A categoria está lotada para todo mundo — menos para quem
              pegar uma destas vagas.
            </p>
            <button type="button" class="sp-cta" [disabled]="claiming()" (click)="claim()">
              {{ claiming() ? 'Pegando a vaga…' : 'Pegar a vaga' }}
            </button>
          }

          @if (error(); as message) {
            <p class="sp-error" role="alert">{{ message }}</p>
          }
        } @else {
          <h1>Vaga não encontrada</h1>
          <p class="sp-body">
            Este link não existe mais. Peça um novo ao organizador do torneio.
          </p>
        }
      </section>
    </main>
  `,
  styles: `
    .sp {
      display: grid;
      place-items: center;
      min-height: 60vh;
      padding: 24px 16px;
    }
    .sp-card {
      width: min(440px, 100%);
      padding: 24px;
      border: 1px solid var(--nexago-border);
      border-radius: 16px;
      background: var(--nexago-surface);
      font-family: var(--font-sans);
    }
    .sp-eyebrow {
      margin: 0 0 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nexago-accent);
    }
    h1 {
      margin: 0 0 2px;
      font-size: 22px;
      line-height: 1.2;
      color: var(--nexago-text);
    }
    .sp-sub {
      margin: 0 0 16px;
      font-size: 14px;
      color: var(--nexago-text-muted);
    }
    .sp-count {
      margin: 0 0 12px;
      font-size: 13px;
      font-weight: 600;
      color: var(--nexago-success);
    }
    .sp-body,
    .sp-dim {
      margin: 0 0 18px;
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--nexago-text-muted);
    }
    .sp-cta {
      width: 100%;
      height: 46px;
      border: 0;
      border-radius: 12px;
      background: var(--nexago-primary);
      color: #fff;
      font-family: inherit;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    }
    .sp-cta:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .sp-cta:focus-visible {
      outline: 2px solid var(--nexago-accent);
      outline-offset: 2px;
    }
    .sp-warn,
    .sp-error {
      margin: 14px 0 0;
      padding: 12px 14px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.5;
    }
    .sp-warn {
      border: 1px solid var(--nexago-warning);
      color: var(--nexago-text);
    }
    .sp-error {
      border: 1px solid var(--nexago-danger);
      color: var(--nexago-text);
    }
  `,
})
export class SpotPassClaimComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly firestore = createFirestore();

  protected readonly loading = signal(true);
  protected readonly claiming = signal(false);
  protected readonly preview = signal<SpotPassLinkPreview | null>(null);
  protected readonly error = signal<string | null>(null);

  private readonly linkId = this.route.snapshot.paramMap.get('linkId')?.trim() ?? '';

  protected readonly soldOut = computed(() => {
    const p = this.preview();
    return p != null && (p.remaining <= 0 || p.status === 'exhausted' || p.status === 'revoked');
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const db = this.firestore;
    if (!db || !this.linkId) {
      this.loading.set(false);
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'tournamentSpotPassLinks', this.linkId));
      if (snap.exists()) {
        const data = snap.data() as Record<string, unknown>;
        this.preview.set({
          tournamentName: String(data['tournamentName'] ?? 'Torneio'),
          categoryLabel: String(data['categoryLabel'] ?? 'Categoria'),
          remaining: Number(data['remaining'] ?? 0),
          total: Number(data['total'] ?? 0),
          status: String(data['status'] ?? 'active'),
        });
      }
    } catch {
      // Sem preview a tela cai no "vaga não encontrada" — a callable segue sendo a autoridade.
    } finally {
      this.loading.set(false);
    }
  }

  protected async claim(): Promise<void> {
    if (this.claiming()) return;
    this.claiming.set(true);
    this.error.set(null);
    try {
      const result = await httpsCallable<{ linkId: string }, { url: string }>(
        athleteFunctions(),
        'claimSpotPassLink',
      )({ linkId: this.linkId });
      const url = result.data?.url ?? '';
      await this.router.navigateByUrl(url || '/competir');
    } catch (err) {
      this.error.set(claimErrorMessage(err));
    } finally {
      this.claiming.set(false);
    }
  }
}
