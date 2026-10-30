-- Migração para o banco que JÁ está no ar: acrescenta a exclusão de dados pessoais do pedido.
-- Cole no Supabase > SQL Editor > Run. (Quem instala do zero com instalar.sql já tem isto.)

-- ============================================================
-- excluir_dados_pedido(codigo, token) — direito de eliminação (LGPD, art. 18, VI).
-- Quem tem o código + o token secreto do pedido (o mesmo do link de acompanhamento) apaga os
-- DADOS PESSOAIS dele: nome, telefone, e-mail, endereço, observações do pedido e dos itens.
-- Ficam só itens, valores, forma de pagamento e datas, sem identificar ninguém, porque o
-- restaurante pode precisar deles para a contabilidade e para o fisco (LGPD, art. 16, I).
-- O token é trocado, então o link de acompanhamento deixa de funcionar. Só vale para pedido já
-- entregue ou cancelado; antes disso a loja precisa dos dados para entregar (art. 7º, V).
-- Código e token errados -> null (mesma resposta de "não encontrado"). Rodar duas vezes é inofensivo.
-- ============================================================
create or replace function public.excluir_dados_pedido(codigo text, token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid bigint; st text;
begin
  if excluir_dados_pedido.codigo is null or excluir_dados_pedido.token is null
     or excluir_dados_pedido.token !~ '^[A-Za-z0-9]{32}$' or length(excluir_dados_pedido.codigo) > 12 then
    return null;
  end if;
  select p.id, p.status into pid, st
  from public.pedidos p join public.pedidos_acesso a on a.pedido_id = p.id
  where p.codigo = upper(trim(excluir_dados_pedido.codigo)) and a.token = excluir_dados_pedido.token;
  if pid is null then return null; end if;
  if st not in ('entregue', 'cancelado') then
    raise exception 'O pedido ainda está em andamento. Depois que for entregue ou cancelado, você poderá excluir seus dados.';
  end if;
  update public.pedidos
     set cliente_nome = 'Dados excluídos', cliente_telefone = '0', cliente_email = null,
         entrega = null, obs = '', atualizado_em = now()
   where id = pid;
  update public.pedido_itens set obs = '' where pedido_id = pid;
  update public.pedidos_acesso
     set token = replace(gen_random_uuid()::text, '-', ''), ip_hash = null
   where pedido_id = pid;
  return jsonb_build_object('excluido', true);
end;
$$;

revoke execute on function public.excluir_dados_pedido(text, text) from public, anon, authenticated;
grant execute on function public.excluir_dados_pedido(text, text) to anon, authenticated;
