-- ============================================================
-- Atualização de horários — Paróquia São Marcos, O Evangelista (Id=759)
-- Campinas/SP — Rua Adelino de Abreu 166, Jardim São Marcos (CEP 13082-230)
-- Fonte: site oficial paroquiasaomarcos.com.br
--
-- Mantém SOMENTE os horários da MATRIZ (sede). As comunidades vinculadas
-- (São Francisco, Frei Galvão, São José, Santa Clara, N. Sra. Aparecida,
-- Mãe da Misericórdia) serão cadastradas como pontos separados.
--
-- Matriz: Domingo 09:30 | Quarta 07:00 | Quinta 07:00
-- FontePrincipal = 6 (SiteOficial) | DiaSemana: Dom=0 Qua=3 Qui=4
-- ============================================================

START TRANSACTION;

-- 1) Antes
SELECT Id, DiaSemana, Horario, Observacao, FontePrincipal
FROM Missas
WHERE IgrejaId = 759
ORDER BY DiaSemana, Horario;

-- 2) Remove horários antigos
DELETE FROM Missas WHERE IgrejaId = 759;

-- 3) Insere só os 3 da Matriz
INSERT INTO Missas (DiaSemana, Horario, Observacao, FontePrincipal, UltimaValidacao, IgrejaId) VALUES
    (0, '09:30:00', NULL, 6, UTC_TIMESTAMP(), 759),  -- Domingo 09:30
    (3, '07:00:00', NULL, 6, UTC_TIMESTAMP(), 759),  -- Quarta 07:00
    (4, '07:00:00', NULL, 6, UTC_TIMESTAMP(), 759);  -- Quinta 07:00

-- 4) Depois — deve retornar 3 linhas
SELECT Id, DiaSemana, Horario, Observacao, FontePrincipal
FROM Missas
WHERE IgrejaId = 759
ORDER BY DiaSemana, Horario;

-- ⚠️ Revise os SELECTs. Se correto: COMMIT;  senão: ROLLBACK;
