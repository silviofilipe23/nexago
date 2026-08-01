import { NxToastService } from './nx-toast.service';

/** O serviço não tem dependências, então roda direto — sem TestBed. O relógio do
 *  Jasmine cobre `setTimeout` E `Date.now()` (usado no pausar/retomar); o projeto
 *  não carrega `zone.js/testing`, então `fakeAsync` não está disponível aqui. */
describe('NxToastService', () => {
  let toasts: NxToastService;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(0));
    toasts = new NxToastService();
  });

  afterEach(() => jasmine.clock().uninstall());

  it('some sozinho em 5s quando não tem ação', () => {
    toasts.success('Reserva confirmada');
    expect(toasts.toasts().length).toBe(1);

    jasmine.clock().tick(4999);
    expect(toasts.toasts().length).toBe(1);

    jasmine.clock().tick(1);
    expect(toasts.toasts().length).toBe(0);
  });

  it('dá 8s quando tem ação — o atleta precisa de tempo pra decidir', () => {
    toasts.error('Pagamento não aprovado', undefined, { label: 'Tentar', run: () => undefined });

    jasmine.clock().tick(5000);
    expect(toasts.toasts().length).toBe(1);

    jasmine.clock().tick(3000);
    expect(toasts.toasts().length).toBe(0);
  });

  it('empilha no máximo 3, descartando o mais antigo', () => {
    toasts.info('primeiro');
    toasts.info('segundo');
    toasts.info('terceiro');
    toasts.info('quarto');

    expect(toasts.toasts().map((t) => t.title)).toEqual(['segundo', 'terceiro', 'quarto']);
  });

  it('não deixa o timer do toast descartado derrubar quem entrou no lugar', () => {
    toasts.info('primeiro');
    jasmine.clock().tick(4000);

    // Chegam na janela em que o timer do 'primeiro' ainda estava vivo.
    toasts.info('segundo');
    toasts.info('terceiro');
    toasts.info('quarto');

    jasmine.clock().tick(1000); // aqui o timer do 'primeiro' teria disparado
    expect(toasts.toasts().length).toBe(3);
  });

  it('pausa e retoma o auto-dismiss preservando o tempo restante', () => {
    toasts.success('Código Pix copiado');

    jasmine.clock().tick(2000);
    toasts.pauseAll();

    jasmine.clock().tick(60_000); // ponteiro parado em cima: nada some
    expect(toasts.toasts().length).toBe(1);

    toasts.resumeAll();
    jasmine.clock().tick(2999);
    expect(toasts.toasts().length).toBe(1);

    jasmine.clock().tick(1); // completa os 5s originais
    expect(toasts.toasts().length).toBe(0);
  });

  it('dispensa por id sem afetar os outros', () => {
    const first = toasts.info('primeiro');
    toasts.info('segundo');

    toasts.dismiss(first);

    expect(toasts.toasts().map((t) => t.title)).toEqual(['segundo']);
  });
});
