import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CepRedirectComponent } from './cep-redirect.component';
import { ChurchesService } from '../../../core/services/churches.service';
import { MetricasService } from '../../../core/services/metricas.service';

/**
 * `/detalhes/{cep}`: CEP sem igreja não pode mandar para a home (Soft 404). Mostra
 * "não encontrada" com noindex; CEP com igreja continua levando à paróquia ou à cidade.
 */
describe('CepRedirectComponent', () => {
  let navegar: jasmine.Spy;

  const montar = (cep: string, busca: () => any) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CepRedirectComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ cep }) } } },
        { provide: ChurchesService, useValue: { searchByCEPv2: busca } },
        { provide: MetricasService, useValue: { registrarVisualizacaoPagina: () => {} } },
      ],
    });
    navegar = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(CepRedirectComponent);
    fixture.detectChanges();
    return fixture;
  };

  const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content');

  it('CEP inválido mostra não encontrada, com noindex, sem ir para a home', () => {
    const f = montar('123', () => of({ data: [] }));
    expect(f.componentInstance.naoEncontrado).toBeTrue();
    expect(navegar).not.toHaveBeenCalled();
    expect(robots()).toBe('noindex, nofollow');
    expect(f.nativeElement.textContent).toContain('Página não encontrada');
  });

  it('CEP sem igreja mostra não encontrada', () => {
    const f = montar('12345678', () => of({ data: [] }));
    expect(f.componentInstance.naoEncontrado).toBeTrue();
    expect(navegar).not.toHaveBeenCalled();
  });

  it('erro da API também não manda para a home', () => {
    const f = montar('12345678', () => throwError(() => ({ status: 503 })));
    expect(f.componentInstance.naoEncontrado).toBeTrue();
    expect(navegar).not.toHaveBeenCalled();
  });

  it('CEP com uma igreja leva à página da paróquia', () => {
    montar('12240540', () =>
      of({ data: [{ nomeUnico: 'x', slug: 'capela-x', cidadeSlug: 'sao-jose-dos-campos', dadosEndereco: { localidade: 'São José dos Campos', uf: 'SP' } }] }),
    );
    expect(navegar).toHaveBeenCalledWith(['/paroquia', 'sp', 'sao-jose-dos-campos', 'capela-x'], { replaceUrl: true });
  });

  it('CEP com várias igrejas leva à página da cidade', () => {
    const endereco = { localidade: 'Taubaté', uf: 'SP' };
    montar('12050543', () => of({ data: [{ nomeUnico: 'a', dadosEndereco: endereco }, { nomeUnico: 'b', dadosEndereco: endereco }] }));
    expect(navegar).toHaveBeenCalledWith(['/missas', 'sp', 'taubate'], { replaceUrl: true });
  });
});
