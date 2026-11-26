-- =====================================================================
-- Lar - migração: link iCalendar da casa
-- Correr UMA vez no projeto "casa" (SQL Editor > New query > Run).
-- Não apaga nem altera dados existentes.
-- =====================================================================

alter table casas add column if not exists ics_url text;
