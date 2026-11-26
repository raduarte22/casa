# Lar — app familiar

Lista de tarefas, compras, agenda e pagamentos da casa, sincronizada em tempo real entre todos os membros. Página web (PWA) instalável no ecrã principal do iPhone. Backend em Supabase.

## Funcionalidades

- **Hoje**: resumo do dia, tarefas urgentes, compromissos e contas a pagar nos próximos 7 dias.
- **Tarefas**: título, notas, prioridade (alta, média, baixa), prazo, categoria, responsável e conclusão. Tarefas atrasadas aparecem a vermelho.
- **Compras**: lista partilhada, agrupada por categoria. Quem compra marca o item e a lista atualiza-se em ambos os telemóveis.
- **Agenda**: almoços, consultas e outros compromissos, com dia, hora opcional, quem vai e notas.
- **Pagar**: contas recorrentes com frequência semanal, mensal, trimestral, semestral, anual ou bienal. O botão **Pago** regista o pagamento no histórico e avança automaticamente para o próximo vencimento. Mostra o custo mensal estimado da casa.
- **Sincronização automática**: qualquer alteração aparece no outro telemóvel em segundos, sem recarregar.

## Configuração (uma vez)

### 1. Projeto Supabase

Se já tens o projeto da app do condomínio, podes usar o mesmo. Caso contrário, cria um novo em [supabase.com](https://supabase.com).

1. **SQL Editor → New query**: cola o conteúdo de `schema.sql` e carrega em **Run**.
   - Corre o ficheiro **uma só vez**. Se já tiveres o projeto do condomínio, as tabelas têm nomes diferentes e não há conflito.
2. **Authentication → URL Configuration**: em **Site URL**, põe `https://raduarte22.github.io/casa/`.
3. **Project Settings → API**: copia o **Project URL** e a chave **anon public**.

No `index.html`, substitui o bloco `CFG`:

```js
const CFG = {
  url: 'https://xxxxx.supabase.co',
  key: 'eyJhbGciOi...'   // anon public
};
```

### 2. Publicar no GitHub Pages

1. Cria o repositório `casa` em github.com (público).
2. No terminal, dentro de `C:\Users\RUIDUARTE\casa`:
   ```
   git init -b main
   git add -A
   git commit -m "Lar: app familiar"
   git remote add origin https://github.com/raduarte22/casa.git
   git push -u origin main
   ```
3. Em **Settings → Pages**: **Deploy from a branch → main → / (root)**.
4. A app fica em `https://raduarte22.github.io/casa/`.

### 3. Primeiro uso

1. Regista-te com o teu email e cria a casa (nome da casa + o teu nome).
2. Toca no ícone 👥 para ver o **código da casa**.
3. A tua esposa regista-se no iPhone dela, escolhe **Entrar com código** e usa o código.
4. Ambos veem os mesmos dados, em tempo real.

Depois, no iPhone: **Safari → Partilhar → Adicionar ao Ecrã Principal**.

## Notas

- **Cada pessoa tem a sua conta** (email e palavra-passe). Não partilhem a mesma conta.
- **Segurança**: as regras de acesso (RLS) no `schema.sql` garantem que só os membros da casa leem os dados dessa casa. A chave *anon* pode estar no código; nunca uses a chave `service_role`.
- **Bienal** significa de 2 em 2 anos. Para pagamentos duas vezes por ano, usa **Semestral**.
- **Tempo real no iPhone**: quando a app está em segundo plano, o iOS pode pausar a ligação. Ao voltar à app, os dados atualizam-se automaticamente.
- **Lembretes**: esta versão não envia notificações push. É uma evolução possível, mas no iPhone exige a app instalada no ecrã principal e iOS 16.4 ou superior.
- **Não testada em produção**: confirma com um teste real (duas contas, tarefa criada num telemóvel a aparecer no outro) antes de confiar nela.
