-- =====================================================================
-- Lar - migração: tarefas domésticas
-- Correr UMA vez no projeto "casa" (SQL Editor > New query > Run).
-- Não apaga nem altera dados existentes.
-- =====================================================================

create table if not exists tarefas_domesticas (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references casas(id) on delete cascade,
  titulo text not null,
  notas text,
  responsavel uuid references auth.users(id) on delete set null,
  periodicidade text not null check (periodicidade in ('diaria', 'semanal', 'quinzenal', 'mensal', 'trimestral', 'semestral', 'anual')),
  data_execucao date not null,
  ultima_feita date,
  feita_por uuid references auth.users(id) on delete set null,
  ativo boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

alter table tarefas_domesticas enable row level security;

create policy "casa gere tarefas domesticas" on tarefas_domesticas
  for all using (is_casa_member(casa_id)) with check (is_casa_member(casa_id));

-- tempo real
alter table tarefas_domesticas replica identity full;
alter publication supabase_realtime add table tarefas_domesticas;
