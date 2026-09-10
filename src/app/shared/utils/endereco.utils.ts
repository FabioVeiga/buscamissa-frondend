/**
 * Extrai só os dígitos do "Número" do endereço — o backend desserializa esse
 * campo como `int` não-nulo (Models/Endereco.cs) mesmo recebendo uma string
 * no JSON, então qualquer texto não numérico (ex.: "S/N", vindo de autofill
 * de navegador/celular, que o `pKeyFilter="int"` do PrimeNG não bloqueia por
 * não passar pelo teclado) quebra a desserialização com um erro cru em vez
 * de uma mensagem amigável. Convenção já usada no restante do código: "0" =
 * sem número.
 */
export const sanitizarNumeroEndereco = (valor: unknown): string => {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  return digitos || "0";
};
