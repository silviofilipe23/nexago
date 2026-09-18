import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import type { FinanceiroReachStatus } from '../data/tournament-role';
import type { OrganizerTournament } from '../data/tournament.model';
import { listMyTournaments } from '../data/tournaments-repository';

/** Fonte única do alcance do Financeiro no menu: a lista de torneios da pessoa logada,
 *  lida UMA vez por uid, só pra decidir se o item "Financeiro" aparece (o predicado é
 *  `showsFinanceiroMenuItem`).
 *
 *  Vive separado do `ChaveamentoContextService`, que era quem servia o menu antes, por
 *  dois motivos que o boot do painel deixou visíveis:
 *  - ao carregar a lista, aquele serviço AUTO-SELECIONA o primeiro torneio, e a seleção
 *    baixa a coleção de jogos inteira dele mais o join de nomes de equipe. Todo login
 *    pagava isso — inclusive quem ia só ao Início — pra o menu saber se mostra um item;
 *  - lá a falha de leitura era indistinguível de "não tem torneio nenhum": o item
 *    "Financeiro" simplesmente não existia pro dono ou gestor, sem mensagem e sem retry.
 *
 *  Daí os dois estados: `carregado` (a lista chegou, seja com o que for) e `desconhecido`
 *  — ainda carregando OU a leitura falhou. Quem consome trata os dois igual e falha
 *  ABERTO; a rota não é bloqueada, então mostrar demais custa uma tela que explica de
 *  quem é o caixa, e esconder demais tira o dinheiro de quem tem direito a ele.
 *
 *  Singleton (`providedIn: 'root'`) que sobrevive a logout→login: o efeito reage à troca
 *  de uid, volta pro estado desconhecido e recarrega pro uid novo, sem vazar a lista do
 *  organizador anterior. */
@Injectable({ providedIn: 'root' })
export class FinanceiroReachService {
  private readonly auth = inject(AuthService);

  readonly status = signal<FinanceiroReachStatus>('desconhecido');
  readonly tournaments = signal<OrganizerTournament[]>([]);

  /** uid pro qual o estado atual foi carregado — evita refetch e detecta a troca de pessoa. */
  private loadedUid: string | null = null;

  constructor() {
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      if (uid === this.loadedUid) return;
      this.loadedUid = uid;
      this.status.set('desconhecido');
      this.tournaments.set([]);
      if (uid) void this.load(uid);
    });
  }

  private async load(uid: string): Promise<void> {
    try {
      const tournaments = await listMyTournaments(uid);
      // Outro uid entrou durante a busca: a resposta é de quem já saiu.
      if (uid !== this.loadedUid) return;
      this.tournaments.set(tournaments);
      this.status.set('carregado');
    } catch (err) {
      // Continua `desconhecido` de propósito: o menu falha aberto e "não carregou" nunca
      // vira "você não tem caixa". O aviso é o que permite descobrir em produção que o
      // alcance parou de carregar pra alguém.
      console.warn('Menu do painel: falha ao ler os torneios do alcance do Financeiro', err);
    }
  }
}
