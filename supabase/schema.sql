-- ═══════════════════════════════════════════════════════════════
-- VigiÁgua — Fase 2 · Schema do Supabase
-- Execute este arquivo inteiro no SQL Editor do painel do Supabase.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Perfis de usuário (liga o auth.users ao papel no sistema) ──
create table if not exists public.usuarios (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null unique,
  nome           text not null,
  perfil         text not null check (perfil in ('regional', 'municipio')),
  municipio_id   int,           -- null para o perfil regional
  municipio_nome text           -- ex.: 'Altônia' (deve bater com o nome usado no sistema)
);

alter table public.usuarios enable row level security;

-- Helper security definer (dono ignora RLS → sem recursão)
create or replace function public.eh_regional() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios u where u.id = auth.uid() and u.perfil = 'regional');
$$;

-- Cada usuário lê o próprio registro; a Regional lê todos.
-- IMPORTANTE: usar a função (security definer) evita recursão infinita de RLS.
drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios
  for select using ( id = auth.uid() or public.eh_regional() );

-- ── 2. Armazém chave-valor sincronizado com o localStorage ──
-- As chaves espelham o cache local: va_config, va_plano_2027,
-- va_munplano_Altônia_2027, va_previewedit_Altônia_2027, etc.
create table if not exists public.va_store (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

alter table public.va_store enable row level security;

-- Helpers de política
create or replace function public.meu_municipio() returns text
language sql stable security definer set search_path = public as $$
  select u.municipio_nome from usuarios u where u.id = auth.uid();
$$;

-- ═══════════════════════════════════════════════════════════════
-- POLÍTICAS DE ACESSO (RLS) — endurecidas na v46
-- A Regional é ADMINISTRADORA: lê e grava qualquer chave (necessário
-- para os painéis de acompanhamento/consolidado e para o backup/
-- restauração feitos pelo planner). Cada MUNICÍPIO lê apenas o
-- planejamento publicado (compartilhado entre todos) e as PRÓPRIAS
-- chaves, e grava apenas as próprias. Um município NÃO enxerga o plano
-- preenchido nem o texto de preview de outro município.
-- ═══════════════════════════════════════════════════════════════

-- REGIONAL: acesso total (leitura e escrita de qualquer chave).
drop policy if exists va_store_regional_write on public.va_store;   -- nome antigo (pré-v46)
drop policy if exists va_store_regional_all on public.va_store;
create policy va_store_regional_all on public.va_store
  for all
  using ( public.eh_regional() )
  with check ( public.eh_regional() );

-- MUNICÍPIO — LEITURA: planejamento publicado (compartilhado) + as próprias chaves.
-- (Substitui a política antiga que deixava qualquer autenticado ler TUDO.)
drop policy if exists va_store_select on public.va_store;
drop policy if exists va_store_municipio_select on public.va_store;
create policy va_store_municipio_select on public.va_store
  for select
  using (
    auth.uid() is not null and (
      key in ('va_config', 'va_planos_index', 'va_feriados', 'va_municipios')
      or key like 'va\_plano\_%' escape '\'
      or key like 'va\_semanas\_%' escape '\'
      or key like 'va\_munplano\_'   || public.meu_municipio() || '\_%' escape '\'
      or key like 'va\_previewedit\_' || public.meu_municipio() || '\_%' escape '\'
    )
  );

-- MUNICÍPIO — ESCRITA: somente as próprias chaves (plano municipal e texto do preview).
drop policy if exists va_store_municipio_write on public.va_store;
create policy va_store_municipio_write on public.va_store
  for all
  using (
    public.meu_municipio() is not null and (
      key like 'va\_munplano\_'   || public.meu_municipio() || '\_%' escape '\'
      or key like 'va\_previewedit\_' || public.meu_municipio() || '\_%' escape '\'
    )
  )
  with check (
    public.meu_municipio() is not null and (
      key like 'va\_munplano\_'   || public.meu_municipio() || '\_%' escape '\'
      or key like 'va\_previewedit\_' || public.meu_municipio() || '\_%' escape '\'
    )
  );

-- ── 3. Vínculo automático dos usuários criados no painel ──
-- Depois de criar os usuários em Authentication → Users (e-mails do
-- padrão abaixo), execute este bloco para preencher a tabela usuarios.
insert into public.usuarios (id, email, nome, perfil, municipio_id, municipio_nome)
select au.id, au.email, m.nome, m.perfil, m.municipio_id, m.municipio_nome
from auth.users au
join (values
  ('regional@vigiagua.pr.gov.br',        '12ª Regional de Saúde',    'regional',  null::int, null::text),
  ('altoparaiso@vigiagua.pr.gov.br',     'Alto Paraíso',             'municipio',  1, 'Alto Paraíso'),
  ('altopiquiri@vigiagua.pr.gov.br',     'Alto Piquiri',             'municipio',  2, 'Alto Piquiri'),
  ('altonia@vigiagua.pr.gov.br',         'Altônia',                  'municipio',  3, 'Altônia'),
  ('brasilandiadosul@vigiagua.pr.gov.br','Brasilândia do Sul',       'municipio',  4, 'Brasilândia do Sul'),
  ('cafezaldosul@vigiagua.pr.gov.br',    'Cafezal do Sul',           'municipio',  5, 'Cafezal do Sul'),
  ('cruzeirodooeste@vigiagua.pr.gov.br', 'Cruzeiro do Oeste',        'municipio',  6, 'Cruzeiro do Oeste'),
  ('douradina@vigiagua.pr.gov.br',       'Douradina',                'municipio',  7, 'Douradina'),
  ('esperancanova@vigiagua.pr.gov.br',   'Esperança Nova',           'municipio',  8, 'Esperança Nova'),
  ('franciscoalves@vigiagua.pr.gov.br',  'Francisco Alves',          'municipio',  9, 'Francisco Alves'),
  ('icaraima@vigiagua.pr.gov.br',        'Icaraíma',                 'municipio', 10, 'Icaraíma'),
  ('ipora@vigiagua.pr.gov.br',           'Iporã',                    'municipio', 11, 'Iporã'),
  ('ivate@vigiagua.pr.gov.br',           'Ivaté',                    'municipio', 12, 'Ivaté'),
  ('mariahelena@vigiagua.pr.gov.br',     'Maria Helena',             'municipio', 13, 'Maria Helena'),
  ('mariluz@vigiagua.pr.gov.br',         'Mariluz',                  'municipio', 14, 'Mariluz'),
  ('novaolimpia@vigiagua.pr.gov.br',     'Nova Olímpia',             'municipio', 15, 'Nova Olímpia'),
  ('perobal@vigiagua.pr.gov.br',         'Perobal',                  'municipio', 16, 'Perobal'),
  ('perola@vigiagua.pr.gov.br',          'Pérola',                   'municipio', 17, 'Pérola'),
  ('saojorgedopatrocinio@vigiagua.pr.gov.br','São Jorge do Patrocínio','municipio', 18, 'São Jorge do Patrocínio'),
  ('tapira@vigiagua.pr.gov.br',          'Tapira',                   'municipio', 19, 'Tapira'),
  ('umuarama@vigiagua.pr.gov.br',        'Umuarama',                 'municipio', 20, 'Umuarama'),
  ('xambre@vigiagua.pr.gov.br',          'Xambrê',                   'municipio', 21, 'Xambrê')
) as m(email, nome, perfil, municipio_id, municipio_nome)
  on lower(au.email) = m.email
on conflict (id) do update
  set nome = excluded.nome, perfil = excluded.perfil,
      municipio_id = excluded.municipio_id, municipio_nome = excluded.municipio_nome;
