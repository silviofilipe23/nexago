import { notificationTargetUrl } from './notifications-repository';

/** O mesmo push vai pro app e pro portal: `url` é rota do app (o build antigo usa a url antes
 *  do tipo), `webUrl` é rota do portal. Notificações antigas só têm `url`. */
describe('notificationTargetUrl', () => {
  it('prefere webUrl, que é a rota do portal', () => {
    expect(notificationTargetUrl({ url: '/organizer/tournaments/t1', webUrl: '/painel/eventos/t1/avaliacoes' }))
      .toBe('/painel/eventos/t1/avaliacoes');
  });

  it('cai na url quando não há webUrl (todas as notificações antigas)', () => {
    expect(notificationTargetUrl({ url: '/painel/eventos/t1/inscricoes' })).toBe('/painel/eventos/t1/inscricoes');
  });

  it('webUrl vazio não conta; sem destino nenhum devolve null', () => {
    expect(notificationTargetUrl({ webUrl: '  ', url: '/painel' })).toBe('/painel');
    expect(notificationTargetUrl(undefined)).toBeNull();
  });
});
