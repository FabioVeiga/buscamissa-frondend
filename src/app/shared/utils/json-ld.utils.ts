/**
 * Serializa um bloco JSON-LD para o corpo de um `<script type="application/ld+json">`.
 *
 * O texto de um `<script>` não é HTML escapável: no prerender ele vai cru para o
 * arquivo. O serializador do Angular SSR já troca `</script` por `&lt;/script`
 * (o elemento não fecha, mas o valor chega ao Google corrompido), e NÃO trata
 * `<!--<script>`, que deixa o parser em "script data double escaped" e engole o
 * resto da página até o próximo `</script>` — schemas e conteúdo seguintes somem.
 * Nome de igreja, pároco e FAQ vêm de cadastro público, então isso é dado de terceiro.
 *
 * Trocar todo `<` por `<` resolve os dois casos: sem `<` não há tag nem
 * comentário possível, e `JSON.parse` devolve exatamente o mesmo valor.
 *
 * Sem imports de propósito: `scripts/json-ld-ssr.test.mjs` importa este arquivo no
 * Node para testar contra o serializador real do `@angular/platform-server`.
 */
export function serializarJsonLd(data: unknown): string {
  return (JSON.stringify(data) ?? 'null').replace(/</g, '\\u003c');
}
