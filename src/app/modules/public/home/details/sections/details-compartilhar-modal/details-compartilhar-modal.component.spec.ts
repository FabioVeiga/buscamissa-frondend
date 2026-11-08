import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';
import { DetailsCompartilharModalComponent } from './details-compartilhar-modal.component';

describe('DetailsCompartilharModalComponent', () => {
  let fixture: ComponentFixture<DetailsCompartilharModalComponent>;
  let c: DetailsCompartilharModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailsCompartilharModalComponent],
      providers: [MessageService, provideNoopAnimations()],
    }).compileComponents();
    fixture = TestBed.createComponent(DetailsCompartilharModalComponent);
    c = fixture.componentInstance;
    c.igrejaNome = 'Paróquia X';
    c.url = 'https://buscamissa.com.br/paroquia/sp/sp/x';
    c.mensagem = 'Horários de missa: Paróquia X - domingo às 7h. Veja todos os horários: https://buscamissa.com.br/paroquia/sp/sp/x';
    c.whatsappUrl = 'https://wa.me/?text=oi';
    c.visible = true;
    fixture.detectChanges();
  });

  const doc = () => document.body;

  it('mostra a prévia da mensagem e o WhatsApp abre o wa.me em nova aba', () => {
    expect(doc().querySelector('.comp__previa')!.textContent).toContain('domingo às 7h');
    const a = doc().querySelector('a.comp__opcao--whatsapp') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('https://wa.me/?text=oi');
    expect(a.getAttribute('target')).toBe('_blank');
  });

  it('WhatsApp emite "whatsapp" e fecha', () => {
    const met = jasmine.createSpy('compartilhado');
    const vis = jasmine.createSpy('visibleChange');
    c.compartilhado.subscribe(met);
    c.visibleChange.subscribe(vis);
    c.enviarWhatsapp();
    expect(met).toHaveBeenCalledWith('whatsapp');
    expect(vis).toHaveBeenCalledWith(false);
  });

  it('copiar link: copia a URL e emite "copy_link"', async () => {
    const write = spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
    const met = jasmine.createSpy('compartilhado');
    c.compartilhado.subscribe(met);
    c.copiarLink();
    await Promise.resolve(); await Promise.resolve();
    expect(write).toHaveBeenCalledWith(c.url);
    expect(met).toHaveBeenCalledWith('copy_link');
  });

  it('falha ao copiar: não emite (não conta compartilhamento que não houve)', async () => {
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.reject(new Error('negado')));
    const met = jasmine.createSpy('compartilhado');
    c.compartilhado.subscribe(met);
    c.copiarMensagem();
    await Promise.resolve(); await Promise.resolve();
    expect(met).not.toHaveBeenCalled();
  });
});
