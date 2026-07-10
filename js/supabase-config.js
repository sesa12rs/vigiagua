/**
 * VigiÁgua — Configuração do Supabase (Fase 2)
 *
 * COMO ATIVAR:
 *   1. Crie um projeto gratuito em https://supabase.com
 *   2. No painel do projeto: Settings → API
 *   3. Copie a "Project URL" e a chave "anon public" para os campos abaixo
 *   4. Execute o arquivo supabase/schema.sql no SQL Editor do painel
 *   5. Crie os usuários (ver supabase/README-fase2.md)
 *
 * ENQUANTO OS CAMPOS ESTIVEREM VAZIOS, o sistema funciona 100% em modo
 * local (localStorage), exatamente como na Fase 1 — inclusive o login
 * de demonstração. Nada quebra sem o Supabase.
 */
window.VIGIAGUA_SUPABASE = {
  url: 'https://usxaxdbxecdcbnxpkkhx.supabase.co',      // ex.: 'https://abcdefghijklm.supabase.co'
  anonKey: 'sb_publishable_0mT_c2FE8a99DcR81BqS2A_2JSTyfp8',  // chave "anon public" (NÃO use a service_role aqui!)
};
