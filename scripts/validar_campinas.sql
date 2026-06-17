-- ============================================================
-- Validação do import em lote — Campinas/SP
-- ============================================================

-- 1) Total de igrejas em Campinas
SELECT COUNT(*) AS total_campinas
FROM Igrejas i
JOIN Enderecos e ON e.IgrejaId = i.Id
WHERE e.CidadeSlug = 'campinas' AND e.Uf = 'SP';

-- 2) Lista completa das igrejas de Campinas (confira nomes, slug, número, contato)
SELECT
    i.Id,
    i.Nome,
    i.Slug,
    i.NomeUnico,
    i.Ativo,
    e.Logradouro,
    e.Numero,
    e.Bairro,
    e.Cep,
    e.Localidade,
    e.Uf,
    i.ImagemUrl,
    i.Criacao
FROM Igrejas i
JOIN Enderecos e ON e.IgrejaId = i.Id
WHERE e.CidadeSlug = 'campinas' AND e.Uf = 'SP'
ORDER BY i.Criacao DESC, i.Nome;

-- 3) Contagem de missas por igreja (igrejas com 0 missas merecem atenção)
SELECT
    i.Id,
    i.Nome,
    COUNT(m.Id) AS qtd_missas
FROM Igrejas i
JOIN Enderecos e ON e.IgrejaId = i.Id
LEFT JOIN Missas m ON m.IgrejaId = i.Id
WHERE e.CidadeSlug = 'campinas' AND e.Uf = 'SP'
GROUP BY i.Id, i.Nome
ORDER BY qtd_missas ASC, i.Nome;

-- 4) Duplicatas (mesmo slug na mesma cidade) — deve retornar 0 linhas
SELECT
    i.Slug,
    e.CidadeSlug,
    e.Uf,
    COUNT(*) AS qtd
FROM Igrejas i
JOIN Enderecos e ON e.IgrejaId = i.Id
WHERE e.CidadeSlug = 'campinas' AND e.Uf = 'SP'
GROUP BY i.Slug, e.CidadeSlug, e.Uf
HAVING COUNT(*) > 1;

-- 5) Sanidade de dados — registros com problema
--    (slug nulo, UF != 2 dígitos, cidade slug vazio, inativo)
SELECT
    i.Id, i.Nome, i.Slug, i.Ativo, e.Uf, e.CidadeSlug
FROM Igrejas i
JOIN Enderecos e ON e.IgrejaId = i.Id
WHERE e.CidadeSlug = 'campinas' AND e.Uf = 'SP'
  AND (
        i.Slug IS NULL OR i.Slug = ''
     OR CHAR_LENGTH(e.Uf) <> 2
     OR e.CidadeSlug IS NULL OR e.CidadeSlug = ''
     OR i.Ativo = 0
  );

-- 6) Igrejas inseridas hoje (ajuste a data se necessário)
SELECT
    i.Id, i.Nome, i.Slug, e.Numero, e.Cep, i.Criacao
FROM Igrejas i
JOIN Enderecos e ON e.IgrejaId = i.Id
WHERE e.CidadeSlug = 'campinas' AND e.Uf = 'SP'
  AND DATE(i.Criacao) = CURDATE()
ORDER BY i.Criacao DESC;
