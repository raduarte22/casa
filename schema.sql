-- =====================================================================
-- Lar (app familiar) - esquema para Supabase
-- Correr uma única vez em: Supabase > SQL Editor > New query > Run
-- =====================================================================

-- ---------- TABELAS ----------

create table if not exists casas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo_convite text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  criado_em timestamptz not null default now()
);

-- cada pessoa pertence a uma só casa
create table if not exists casa_membros (
  user_id uuid primary key references auth.users(id) on delete cascade,
  casa_id uuid not null references casas(id) on delete cascade,
  nome text not null,
  entrou_em timestamptz not null default now()
);

create table if not exists tarefas (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references casas(id) on delete cascade,
  titulo text not null,
  notas text,
  prioridade text not null default 'media' check (prioridade in ('alta', 'media', 'baixa')),
  categoria text,
  data_limite date,
  atribuido_a uuid references auth.users(id) on delete set null,
  feito boolean not null default false,
  feito_em timestamptz,
  feito_por uuid references auth.users(id) on delete set null,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

create table if not exists compras (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references casas(id) on delete cascade,
  nome text not null,
  categoria text,
  comprado boolean not null default false,
  comprado_por uuid references auth.users(id) on delete set null,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references casas(id) on delete cascade,
  titulo text not null,
  data date not null,
  hora time,
  tipo text not null default 'outro' check (tipo in ('refeicao', 'consulta', 'outro')),
  quem uuid references auth.users(id) on delete set null,
  notas text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

create table if not exists pagamentos (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references casas(id) on delete cascade,
  nome text not null,
  valor numeric(12,2) not null check (valor >= 0),
  categoria text,
  frequencia text not null check (frequencia in ('semanal', 'mensal', 'trimestral', 'semestral', 'anual', 'bienal')),
  proximo_vencimento date not null,
  ativo boolean not null default true,
  notas text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

-- histórico de pagamentos feitos (guarda nome e valor, mesmo que o pagamento seja apagado)
create table if not exists pagamentos_historico (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references casas(id) on delete cascade,
  pagamento_id uuid references pagamentos(id) on delete set null,
  nome text not null,
  valor numeric(12,2) not null,
  data_pago date not null default current_date,
  pago_por uuid references auth.users(id) on delete set null
);

-- ---------- FUNÇÕES ----------

create or replace function is_casa_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from casa_membros where user_id = auth.uid() and casa_id = cid)
$$;

-- cria a casa e torna quem a cria o primeiro membro
create or replace function criar_casa(p_nome text, p_meu_nome text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Sessão inexistente'; end if;
  if exists (select 1 from casa_membros where user_id = auth.uid()) then
    raise exception 'Já estás ligado a uma casa';
  end if;
  insert into casas (nome) values (trim(p_nome)) returning id into cid;
  insert into casa_membros (user_id, casa_id, nome) values (auth.uid(), cid, trim(p_meu_nome));
  return cid;
end $$;

-- entra numa casa com o código de convite
create or replace function aderir_casa(p_codigo text, p_meu_nome text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Sessão inexistente'; end if;
  if exists (select 1 from casa_membros where user_id = auth.uid()) then
    raise exception 'Já estás ligado a uma casa';
  end if;
  select id into cid from casas where codigo_convite = upper(trim(p_codigo));
  if cid is null then raise exception 'Código de convite inválido'; end if;
  insert into casa_membros (user_id, casa_id, nome) values (auth.uid(), cid, trim(p_meu_nome));
  return cid;
end $$;

-- ---------- SEGURANÇA POR LINHA (RLS) ----------
-- Regra simples: só os membros de uma casa leem e escrevem os dados dessa casa.

alter table casas enable row level security;
alter table casa_membros enable row level security;
alter table tarefas enable row level security;
alter table compras enable row level security;
alter table eventos enable row level security;
alter table pagamentos enable row level security;
alter table pagamentos_historico enable row level security;

create policy "membros leem a sua casa" on casas for select using (is_casa_member(id));
create policy "membros editam a sua casa" on casas for update using (is_casa_member(id)) with check (is_casa_member(id));

create policy "membros leem membros da casa" on casa_membros for select using (is_casa_member(casa_id));
create policy "cada um altera o seu nome" on casa_membros for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cada um sai da casa" on casa_membros for delete using (user_id = auth.uid());

create policy "casa gere tarefas" on tarefas for all using (is_casa_member(casa_id)) with check (is_casa_member(casa_id));
create policy "casa gere compras" on compras for all using (is_casa_member(casa_id)) with check (is_casa_member(casa_id));
create policy "casa gere eventos" on eventos for all using (is_casa_member(casa_id)) with check (is_casa_member(casa_id));
create policy "casa gere pagamentos" on pagamentos for all using (is_casa_member(casa_id)) with check (is_casa_member(casa_id));
create policy "casa gere historico" on pagamentos_historico for all using (is_casa_member(casa_id)) with check (is_casa_member(casa_id));

-- ---------- SINCRONIZAÇÃO EM TEMPO REAL ----------
-- Necessário para o Realtime enviar também as remoções (DELETE) com o filtro por casa.

alter table tarefas replica identity full;
alter table compras replica identity full;
alter table eventos replica identity full;
alter table pagamentos replica identity full;
alter table pagamentos_historico replica identity full;
alter table casa_membros replica identity full;

alter publication supabase_realtime add table tarefas, compras, eventos, pagamentos, pagamentos_historico, casa_membros;
