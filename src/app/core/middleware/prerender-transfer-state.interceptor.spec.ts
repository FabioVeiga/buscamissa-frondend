import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID, TransferState } from '@angular/core';
import { HttpRequest, HttpHandler, HttpResponse, HttpEvent } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { PrerenderTransferStateInterceptor } from './prerender-transfer-state.interceptor';
import { chaveCidade, chaveParoquia, stateKeyCidade, stateKeyParoquia } from './prerender-state-keys';

/**
 * Contrato SWR do interceptor de leitura do TransferState (Fase "frescor de dados"):
 * emitir o cache prerenderizado na hora E revalidar ao vivo, sem que a falha da
 * revalidação derrube o conteúdo já renderizado.
 */
describe('PrerenderTransferStateInterceptor (SWR)', () => {
  let interceptor: PrerenderTransferStateInterceptor;
  let ts: TransferState;

  const url = 'https://api.exemplo.com/api/v2/Igreja/paroquia/rj/mendes/paroquia-santa-cruz';
  const key = stateKeyParoquia(chaveParoquia(url)!);

  const next = (resp$: Observable<HttpEvent<unknown>>): HttpHandler =>
    ({ handle: () => resp$ } as HttpHandler);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PrerenderTransferStateInterceptor,
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    ts = TestBed.inject(TransferState);
    interceptor = TestBed.inject(PrerenderTransferStateInterceptor);
  });

  it('emite o cache do TransferState e DEPOIS a revalidação viva (2 emissões)', (done) => {
    ts.set<any>(key, { data: { igreja: { id: 1, nome: 'cache' } } });
    const vivo = new HttpResponse({ status: 200, url, body: { data: { igreja: { id: 1, nome: 'vivo' } } } });

    interceptor.intercept(new HttpRequest('GET', url), next(of(vivo)))
      .pipe(toArray())
      .subscribe((eventos) => {
        const nomes = eventos.map((e) => (e as HttpResponse<any>).body.data.igreja.nome);
        expect(nomes).toEqual(['cache', 'vivo']);       // ordem SWR: cache → vivo
        expect(ts.hasKey(key)).toBeFalse();             // chave consumida no finalize
        done();
      });
  });

  it('revalidação que FALHA não propaga erro — mantém só o cache (catchError + finalize)', (done) => {
    ts.set<any>(key, { data: { igreja: { id: 1, nome: 'cache' } } });

    interceptor.intercept(new HttpRequest('GET', url), next(throwError(() => new Error('500'))))
      .pipe(toArray())
      .subscribe({
        next: (eventos) => {
          expect(eventos.length).toBe(1);               // só o cache; erro engolido
          expect(ts.hasKey(key)).toBeFalse();           // finalize roda mesmo com erro
          done();
        },
        error: () => fail('a revalidação NÃO deve virar erro da página'),
      });
  });

  it('revalidação com 404 PROPAGA o erro, depois do cache — o recurso deixou de existir', (done) => {
    ts.set<any>(key, { data: { igreja: { id: 1, nome: 'cache' } } });
    const emitidos: unknown[] = [];

    interceptor.intercept(new HttpRequest('GET', url), next(throwError(() => ({ status: 404 }))))
      .subscribe({
        next: (e) => emitidos.push(e),
        error: (err) => {
          expect(emitidos.length).withContext('o cache já foi entregue antes do 404').toBe(1);
          expect(err.status).toBe(404);
          // `finalize` roda no teardown, DEPOIS deste callback de erro.
          setTimeout(() => {
            expect(ts.hasKey(key)).toBeFalse();
            done();
          });
        },
        complete: () => fail('404 na revalidação deve chegar ao componente'),
      });
  });

  it('404 na revalidação de OUTRO recurso (não paróquia) continua engolido', (done) => {
    const urlCidade = 'https://api.exemplo.com/api/v2/Igreja/cidade/rj/mendes';
    const keyCidade = stateKeyCidade(chaveCidade(urlCidade)!);
    ts.set<any>(keyCidade, { data: { igrejas: [] } });

    interceptor.intercept(new HttpRequest('GET', urlCidade), next(throwError(() => ({ status: 404 }))))
      .pipe(toArray())
      .subscribe({
        next: (eventos) => {
          expect(eventos.length).toBe(1);
          done();
        },
        error: () => fail('só a paróquia propaga o 404'),
      });
  });

  it('sem chave no TransferState → passthrough (1 emissão, direto da rede)', (done) => {
    const vivo = new HttpResponse({ status: 200, url, body: { data: { igreja: { id: 9 } } } });

    interceptor.intercept(new HttpRequest('GET', url), next(of(vivo)))
      .pipe(toArray())
      .subscribe((eventos) => {
        expect(eventos.length).toBe(1);
        done();
      });
  });
});
