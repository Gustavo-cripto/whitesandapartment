# Setup Supabase OTP (sem cartao)

## 1) Criar projeto
- Crie um projeto em [Supabase](https://supabase.com) (plano free).
- Em `Authentication > Providers > Email`, deixe Email ativo.
- Em `Authentication > URL Configuration`, adicione:
  - `Site URL`: seu dominio do site
  - `Redirect URLs`: `https://seu-dominio/wifi-acesso.html*`

## 2) Configurar chaves no site
- Abra `supabase-config.js`.
- Preencha:
  - `window.WS_SUPABASE_URL`
  - `window.WS_SUPABASE_ANON_KEY`

## 3) Criar tabelas e RLS (SQL Editor)
```sql
create table if not exists public.wifi_apartments (
  apt text primary key check (apt ~ '^[B-J]$'),
  network_name text not null,
  wifi_password text not null
);

create table if not exists public.wifi_access (
  id bigint generated always as identity primary key,
  apt text not null check (apt ~ '^[B-J]$'),
  guest_email text not null,
  created_at timestamptz not null default now(),
  unique (apt, guest_email)
);

alter table public.wifi_apartments enable row level security;
alter table public.wifi_access enable row level security;

drop policy if exists "wifi_access_select_own" on public.wifi_access;
create policy "wifi_access_select_own"
on public.wifi_access
for select
to authenticated
using (lower(guest_email) = lower(auth.email()));

drop policy if exists "wifi_apartments_select_if_allowed" on public.wifi_apartments;
create policy "wifi_apartments_select_if_allowed"
on public.wifi_apartments
for select
to authenticated
using (
  exists (
    select 1
    from public.wifi_access wa
    where wa.apt = wifi_apartments.apt
      and lower(wa.guest_email) = lower(auth.email())
  )
);
```

## 4) Inserir dados Wi-Fi por apartamento
```sql
insert into public.wifi_apartments (apt, network_name, wifi_password) values
('B', 'WhiteSand-B', 'password-b'),
('C', 'WhiteSand-C', 'password-c'),
('D', 'WhiteSand-D', 'password-d'),
('E', 'WhiteSand-E', 'password-e'),
('F', 'WhiteSand-F', 'password-f'),
('G', 'WhiteSand-G', 'password-g'),
('H', 'WhiteSand-H', 'password-h'),
('I', 'WhiteSand-I', 'password-i'),
('J', 'WhiteSand-J', 'password-j')
on conflict (apt) do update
set network_name = excluded.network_name,
    wifi_password = excluded.wifi_password;
```

## 5) Autorizar hospedes por apartamento
```sql
insert into public.wifi_access (apt, guest_email) values
('B', 'hospede@email.com')
on conflict (apt, guest_email) do nothing;
```

## 6) Fluxo final
- Hospede abre `wifi-acesso.html?apt=B&lang=pt`.
- Insere email.
- Recebe link OTP no email.
- Depois do login, ve apenas rede/password do apartamento autorizado.

## Nota de deploy
- Sempre que alterar `Environment Variables/Secrets` na Cloudflare Pages, faca um novo deploy (retry ou novo commit) para aplicar as mudancas em producao.
