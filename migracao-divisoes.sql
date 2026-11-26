-- =====================================================================
-- Lar - migração: divisões (compras e tarefas da casa) e marcas diárias
-- Correr UMA vez no projeto "casa" (SQL Editor > New query > Run).
-- Não apaga dados existentes.
-- =====================================================================

alter table compras add column if not exists divisao text not null default 'Geral';
alter table tarefas_domesticas add column if not exists divisao text not null default 'Geral';
alter table tarefas_domesticas add column if not exists data_anterior date;
alter table tarefas_domesticas drop constraint if exists tarefas_domesticas_periodicidade_check;
alter table tarefas_domesticas add constraint tarefas_domesticas_periodicidade_check
  check (periodicidade in ('diaria', 'semanal', 'quinzenal', 'mensal', 'trimestral', 'semestral', 'anual'));
