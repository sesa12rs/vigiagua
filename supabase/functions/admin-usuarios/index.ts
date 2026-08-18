// VigiÁgua — Edge Function "admin-usuarios"
// Permite que a REGIONAL crie municípios e resete senhas DIRETO PELO SISTEMA,
// sem abrir o painel do Supabase. A chave service_role (mestra) fica só aqui,
// no servidor — nunca no navegador.
//
// Segurança: toda chamada precisa vir de um usuário logado cujo perfil, na
// tabela `usuarios`, seja 'regional'. Caso contrário, é recusada.
//
// Deploy (uma vez): ver supabase/README-fase2.md → seção "Painel de usuários".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, erro: 'Método não permitido.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!url || !anonKey || !serviceKey) {
      return json({ ok: false, erro: 'Função sem variáveis de ambiente configuradas.' }, 500);
    }

    // 1) Identifica quem está chamando (pelo token JWT enviado pelo app)
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!token) return json({ ok: false, erro: 'Sem autenticação.' }, 401);

    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await asCaller.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, erro: 'Sessão inválida. Entre novamente.' }, 401);
    const callerId = userData.user.id;

    // 2) Cliente administrativo (service_role) e checagem: só a Regional passa
    const admin = createClient(url, serviceKey);
    const { data: perfilRow } = await admin
      .from('usuarios').select('perfil').eq('id', callerId).single();
    if (!perfilRow || perfilRow.perfil !== 'regional') {
      return json({ ok: false, erro: 'Apenas a Regional pode gerenciar usuários.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const acao = body.acao;

    // 3) Ações
    if (acao === 'criar') {
      const email = String(body.email || '').trim().toLowerCase();
      const senha = String(body.senha || '');
      const nome = String(body.nome || '').trim();
      const municipioId = body.municipioId ?? null;
      const municipioNome = String(body.municipioNome || nome).trim();
      if (!email || senha.length < 6 || !nome) {
        return json({ ok: false, erro: 'Dados incompletos (e-mail, nome e senha de 6+ caracteres).' }, 400);
      }
      // Cria no Auth (email_confirm=true → não exige confirmação por e-mail;
      // funciona com e-mail fake). senhaDefinida=false → troca obrigatória no 1º acesso.
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password: senha, email_confirm: true,
        user_metadata: { nome, senhaDefinida: false },
      });
      if (cErr) return json({ ok: false, erro: cErr.message }, 400);
      const novoId = created.user!.id;
      const { error: iErr } = await admin.from('usuarios').insert({
        id: novoId, email, nome, perfil: 'municipio',
        municipio_id: municipioId, municipio_nome: municipioNome,
      });
      if (iErr) {
        // desfaz o usuário do Auth para não deixar conta órfã
        await admin.auth.admin.deleteUser(novoId).catch(() => {});
        return json({ ok: false, erro: 'Falha ao gravar o perfil: ' + iErr.message }, 400);
      }
      return json({ ok: true, id: novoId });
    }

    if (acao === 'resetar') {
      const userId = String(body.userId || '');
      const senha = String(body.senha || '');
      if (!userId || senha.length < 6) return json({ ok: false, erro: 'Dados incompletos para resetar.' }, 400);
      // Preserva o restante do metadata e marca senhaDefinida=false (troca no próximo acesso)
      const { data: alvo } = await admin.auth.admin.getUserById(userId);
      const meta = { ...(alvo?.user?.user_metadata || {}), senhaDefinida: false };
      const { error: rErr } = await admin.auth.admin.updateUserById(userId, {
        password: senha, user_metadata: meta,
      });
      if (rErr) return json({ ok: false, erro: rErr.message }, 400);
      return json({ ok: true });
    }

    if (acao === 'trocar_email') {
      const userId = String(body.userId || '');
      const email = String(body.email || '').trim().toLowerCase();
      if (!userId || !email) return json({ ok: false, erro: 'Dados incompletos.' }, 400);
      const { error: eErr } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (eErr) return json({ ok: false, erro: eErr.message }, 400);
      await admin.from('usuarios').update({ email }).eq('id', userId);
      return json({ ok: true });
    }

    return json({ ok: false, erro: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return json({ ok: false, erro: String((e as Error)?.message || e) }, 500);
  }
});
