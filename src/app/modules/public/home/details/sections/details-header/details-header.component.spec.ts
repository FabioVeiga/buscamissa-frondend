import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { DetailsHeaderComponent } from './details-header.component';

/**
 * Trava a correção de LCP das páginas de paróquia (P3.1).
 *
 * Esta foto é o elemento LCP da página — medido em produção, mobile: LCP 5.012ms,
 * com a imagem sendo descoberta só em t=1.652ms porque `loading="lazy"` a esconde do
 * preload scanner. É a ÚNICA <img> da subárvore de details e fica sempre no topo,
 * então priorizá-la não compete com nenhuma outra imagem.
 *
 * Sobre width/height: deliberadamente ausentes. A caixa renderizada inverte de
 * proporção entre breakpoints (389×154 no mobile, 168×273 a partir de 640px), o
 * contêiner `.church-thumb` já reserva o espaço nos dois, e a imagem contribui 0 de
 * CLS hoje. Um par único de atributos seria incoerente em pelo menos um breakpoint.
 */
describe('DetailsHeaderComponent — prioridade da imagem LCP', () => {
  let fixture: ComponentFixture<DetailsHeaderComponent>;
  let c: DetailsHeaderComponent;

  const igreja = (imagemUrl: string | null) => ({
    id: 1,
    nome: 'Catedral Basílica Nossa Senhora das Neves',
    imagemUrl,
    paroco: 'Pe. Teste',
    endereco: {
      logradouro: 'Praça Dom Ulrico', numero: '1', complemento: '',
      bairro: 'Centro', localidade: 'João Pessoa', uf: 'PB',
      latitude: -7.11, longitude: -34.87,
    },
    circunscricao: { arquidioceseNome: 'Arquidiocese da Paraíba', dioceseNome: null },
  });

  const foto = () => fixture.nativeElement.querySelector('.church-thumb img') as HTMLImageElement | null;

  const montar = (imagemUrl: string | null = 'https://exemplo.test/igreja/235.png') => {
    fixture = TestBed.createComponent(DetailsHeaderComponent);
    c = fixture.componentInstance;
    c.igreja = igreja(imagemUrl);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailsHeaderComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('a imagem LCP NÃO é lazy', () => {
    montar();
    const img = foto();
    expect(img).withContext('a foto precisa existir para o teste valer').not.toBeNull();
    expect(img!.getAttribute('loading'))
      .withContext('`loading="lazy"` esconde o LCP do preload scanner — 1,4s de atraso medido')
      .toBeNull();
  });

  it('a imagem LCP tem fetchpriority="high"', () => {
    montar();
    expect(foto()!.getAttribute('fetchpriority')).toBe('high');
  });

  it('não declara width/height (decisão registrada: a proporção inverte entre breakpoints)', () => {
    montar();
    const img = foto()!;
    expect(img.getAttribute('width')).toBeNull();
    expect(img.getAttribute('height')).toBeNull();
  });

  it('prioriza exatamente UMA imagem — nenhuma secundária ganha prioridade indevida', () => {
    montar();
    const priorizadas = fixture.nativeElement.querySelectorAll('img[fetchpriority="high"]');
    expect(priorizadas.length).toBe(1);
    const todas = fixture.nativeElement.querySelectorAll('img');
    expect(todas.length).withContext('o header tem uma única <img>').toBe(1);
  });

  it('sem imagemUrl: cai no placeholder e não sobra nenhuma <img> priorizada', () => {
    montar(null);
    expect(foto()).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('img[fetchpriority="high"]').length).toBe(0);
    expect(fixture.nativeElement.querySelector('app-church-placeholder')).not.toBeNull();
  });

  it('erro ao carregar a foto: troca pelo placeholder sem deixar imagem priorizada', () => {
    montar();
    // Dispara o evento real em vez de setar `fotoQuebrou` na instância: o componente é
    // OnPush, então só a passagem pelo event binding do template marca a view como
    // suja. Setar o campo direto passava por sorte, dependendo da ordem dos testes.
    foto()!.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(foto()).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('img[fetchpriority="high"]').length).toBe(0);
    expect(fixture.nativeElement.querySelector('app-church-placeholder')).not.toBeNull();
  });

  it('a caixa da foto (.church-thumb) permanece no DOM — reserva de layout intacta', () => {
    montar();
    expect(fixture.nativeElement.querySelector('.church-thumb')).not.toBeNull();
    montar(null);
    expect(fixture.nativeElement.querySelector('.church-thumb'))
      .withContext('sem foto o contêiner segue existindo, então não há salto de layout')
      .not.toBeNull();
  });
});
