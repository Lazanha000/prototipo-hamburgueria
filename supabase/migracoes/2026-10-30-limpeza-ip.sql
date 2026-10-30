-- OPCIONAL (minimização de dados): apaga o código irreversível do IP (ip_hash) 1 dia depois do pedido.
-- Ele só serve para limitar pedidos por rede nos últimos 10 minutos; guardar mais que isso não tem uso.
-- Precisa da extensão pg_cron (Supabase > Database > Extensions > pg_cron). Rode uma vez no SQL Editor.
create extension if not exists pg_cron;
select cron.schedule(
  'limpar-ip-hash', '17 3 * * *',
  $$update public.pedidos_acesso set ip_hash = null
    where ip_hash is not null
      and pedido_id in (select id from public.pedidos where criado_em < now() - interval '1 day')$$
);
