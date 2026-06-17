-- ============================================================
-- Atualização de horários — Paróquia Santos Apóstolos (Id=760)
-- Campinas/SP — Rua dos Ébanos, Vila Boa Vista (CEP 13064-755)
-- Fonte: agenda oficial (bio.site/AgendaSantosApostolos)
--
-- Substitui o único horário atual pelos 7 confirmados:
--   Domingo  08:00 / 11:00 / 19:00
--   Terça    15:00  (Missa pela saúde)
--   Quarta   19:30
--   Sexta    19:30
--   Sexta    16:00  (1ª sexta do mês — com adoração)
--
-- FontePrincipal = 6 (SiteOficial) | DiaSemana: Dom=0 Seg=1 Ter=2 Qua=3 Qui=4 Sex=5 Sab=6
-- ============================================================

START TRANSACTION;

-- 1) Confere o que existe hoje (antes)
SELECT Id, DiaSemana, Horario, Observacao, FontePrincipal
FROM Missas
WHERE IgrejaId = 760
ORDER BY DiaSemana, Horario;

-- 2) Remove os horários antigos desta igreja
DELETE FROM Missas WHERE IgrejaId = 760;

-- 3) Insere os 7 horários confirmados
INSERT INTO Missas (DiaSemana, Horario, Observacao, FontePrincipal, UltimaValidacao, IgrejaId) VALUES
    (0, '08:00:00', NULL,                             6, UTC_TIMESTAMP(), 760),  -- Domingo 08:00
    (0, '11:00:00', NULL,                             6, UTC_TIMESTAMP(), 760),  -- Domingo 11:00
    (0, '19:00:00', NULL,                             6, UTC_TIMESTAMP(), 760),  -- Domingo 19:00
    (2, '15:00:00', 'Missa pela saúde',               6, UTC_TIMESTAMP(), 760),  -- Terça 15:00
    (3, '19:30:00', NULL,                             6, UTC_TIMESTAMP(), 760),  -- Quarta 19:30
    (5, '19:30:00', NULL,                             6, UTC_TIMESTAMP(), 760),  -- Sexta 19:30
    (5, '16:00:00', '1ª sexta do mês — com adoração', 6, UTC_TIMESTAMP(), 760);  -- Sexta 16:00 (mensal)

-- 4) Confere o resultado (depois) — deve retornar 7 linhas
SELECT Id, DiaSemana, Horario, Observacao, FontePrincipal
FROM Missas
WHERE IgrejaId = 760
ORDER BY DiaSemana, Horario;

-- ⚠️ Revise os SELECTs acima. Se estiver correto, confirme:
-- COMMIT;
-- Caso contrário:
-- ROLLBACK;
