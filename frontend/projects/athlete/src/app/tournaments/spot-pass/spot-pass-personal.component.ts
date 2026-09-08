import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  getDocs,
  getFirestore,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { SPOT_PASSES_COLLECTION } from '../../data/spot-passes-repository';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** Confirmação da vaga NOMINAL, aberta pelo link que o organizador mandou no privado.
 *
 *  Por que esta tela existe, em vez de o link apontar direto para a inscrição: no Android o app
 *  publicado reivindica `/torneios/**` como App Link, então um link para lá é entregue ao app —
 *  e o app publicado bloqueia a categoria lotada antes de consultar o servidor, porque ele não
 *  conhece passe de vaga. O atleta cairia num "LOTADO" sem saída.
 *
 *  `/vaga/**` não é reivindicado por nenhuma das duas plataformas, então o link abre no
 *  navegador, onde o portal está em dia. Daqui para frente a navegação é interna (History API),
 *  que não dispara App Link nenhum — é isso que faz o fluxo continuar até o fim. */
@Component({
  selector: 'app-spot-pass-personal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="sp">
      <section class="sp-card">
        @if (loading()) {
          <p class="sp-dim">Procurando a sua vaga…</p>
        } @else if (categoryLabel(); as label) {
          <p class="sp-eyebrow">Vaga liberada</p>
          <h1>{{ label }}</h1>
          <p class="sp-sub">A vaga é sua até a chave da categoria ser publicada.</p>
          <p class="sp-body">
            A categoria está lotada para todo mundo — menos para você. Continue e faça sua
            inscrição normalmente: convide seu parceiro e pague pelo app.
          </p>
          <button type="button" class="sp-cta" (click)="continue()">Fazer minha inscrição</button>
        } @else {
          <h1>Nenhuma vaga para você aqui</h1>
          <p class="sp-body">
            Não encontramos uma vaga liberada para esta conta neste torneio. Ela pode ter sido
            usada, revogada, ou o link pode ser de outra pessoa. Fale com o organizador.
          </p>
        }
      </section>
    </main>
  `,
  styleUrls: ['./spot-pass.scss'],
})
export class SpotPassPersonalComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  protected readonly loading = signal(true);
  protected readonly categoryLabel = signal<string | null>(null);

  private readonly tournamentId =
    this.route.snapshot.queryParamMap.get('t')?.trim() ?? '';
  private readonly categoryId =
    this.route.snapshot.queryParamMap.get('c')?.trim() ?? '';

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const db = this.firestore;
    const uid = this.auth.user()?.uid ?? '';
    if (!db || !uid || !this.tournamentId) {
      this.loading.set(false);
      return;
    }
    try {
      const snap = await getDocs(
        query(
          collection(db, SPOT_PASSES_COLLECTION),
          where('athleteUid', '==', uid),
          where('tournamentId', '==', this.tournamentId),
        ),
      );
      for (const document of snap.docs) {
        const data = document.data() as Record<string, unknown>;
        if (data['status'] !== 'active') continue;
        const category = String(data['categoryId'] ?? '').trim();
        // Sem `c` na query o link ainda vale: qualquer vaga viva deste torneio serve.
        if (this.categoryId && category !== this.categoryId) continue;
        this.categoryLabel.set(String(data['categoryLabel'] ?? 'Categoria'));
        break;
      }
    } catch {
      // Leitura negada ou offline: a tela diz que não achou, e o organizador reenvia.
    } finally {
      this.loading.set(false);
    }
  }

  /** Navegação INTERNA de propósito: uma URL nova dispararia o App Link e devolveria o atleta
   *  ao app publicado, que é justamente o beco que este caminho existe para evitar. */
  protected continue(): void {
    const query = this.categoryId ? `?categoryId=${encodeURIComponent(this.categoryId)}` : '';
    void this.router.navigateByUrl(`/torneios/${this.tournamentId}/inscricao${query}`);
  }
}
