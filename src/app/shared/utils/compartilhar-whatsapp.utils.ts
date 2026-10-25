import { RegraRecorrencia, descrever, ehSemanal, formatarHora } from './recorrencia-missa';

/** UTM do link enviado pelo botão "Enviar no WhatsApp". A canonical da página segue sem UTM. */
export const UTM_WHATSAPP_IGREJA = 'utm_source=whatsapp&utm_medium=share&utm_campaign=igreja';

/**
 * Resumo dos horários para a mensagem: as missas semanais de domingo
 * ("domingo às 7h, 9h e 19h") ou, sem missa de domingo, a próxima missa
 * ("próxima missa: sábado, 19h"). Vazio quando a igreja não tem horários.
 *
 * Sem "hoje"/"amanhã": a mensagem é lida horas ou dias depois de enviada.
 */
export function resumoHorariosWhatsapp(missas: RegraRecorrencia[], proxima: RegraRecorrencia | null): string {
  const horasDomingo = [...new Set(
    missas
      .filter((m) => ehSemanal(m) && m.diaSemana === 0 && !!m.horario)
      .map((m) => m.horario.slice(0, 5)),
  )].sort().map(formatarHora);

  if (horasDomingo.length) {
    const lista = horasDomingo.length === 1
      ? horasDomingo[0]
      : `${horasDomingo.slice(0, -1).join(', ')} e ${horasDomingo[horasDomingo.length - 1]}`;
    return `domingo às ${lista}`;
  }
  if (proxima) {
    const desc = descrever(proxima);
    return `próxima missa: ${desc.charAt(0).toLowerCase()}${desc.slice(1)}`;
  }
  return '';
}

/** Link `wa.me` com a mensagem pronta (texto codificado) para a página de igreja. */
export function linkWhatsappIgreja(
  nomeIgreja: string,
  missas: RegraRecorrencia[],
  proxima: RegraRecorrencia | null,
  shareUrl: string,
): string {
  const resumo = resumoHorariosWhatsapp(missas, proxima);
  const url = `${shareUrl}${shareUrl.includes('?') ? '&' : '?'}${UTM_WHATSAPP_IGREJA}`;
  const texto = `Missa na ${nomeIgreja}${resumo ? `: ${resumo}` : ''}. Veja todos os horários: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
