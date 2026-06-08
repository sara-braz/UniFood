# UniFood

Sistema de reservas de refeições para o campus universitário do ISCTE. Permite que estudantes consultem restaurantes no mapa, visualizem menus com alergénios, façam reservas e levantem as refeições através de um QR code. Os restaurantes gerem o menu, confirmam reservas e validam levantamentos pelo painel de controlo. O sistema inclui notificações em tempo real, carteira digital e conformidade com o RGPD.

---

## Arquitetura

O projeto é composto por dois servidores independentes e dois frontends em HTML/JS vanilla.

**Backend (server.js)** corre na porta 3000 com Express.js e persiste os dados numa base de dados MySQL chamada `unifood`. As migrações de schema são executadas automaticamente no arranque.

**Servidor estático (serve.js)** corre na porta 8080 e serve os ficheiros HTML, CSS e JS do frontend.

**Área de estudantes** (index.html + index.js + style.css) permite login, consulta de restaurantes, mapa interativo, criação e gestão de reservas, carteira e definições de conta.

**Área de restaurantes** (restaurant.html + restaurant.js + restaurant.css) oferece um painel com estatísticas, gestão de reservas, gestão do menu e edição do perfil.

---

## Pré-requisitos

- Node.js 18 ou superior
- MySQL 8 com uma base de dados chamada `unifood` e utilizador `unifood_user` com password `password`

---

## Instalação e arranque

```bash
npm install
```

Arrancar o servidor de API:

```bash
node server.js
```

Arrancar o servidor de ficheiros estáticos numa segunda janela de terminal:

```bash
node serve.js
```

Abrir no browser: `http://localhost:8080`

Para popular a base de dados com restaurantes e menus de exemplo:

```bash
node seed.js
```

---

## Base de dados

Tabelas principais:

- **users** — estudantes e contas de restaurante (`role: student | restaurant`); inclui campo `saldo` para carteira digital
- **restaurants** — perfil de cada restaurante (nome, localização, horário, contacto, descrição, coordenadas GPS `latitude`/`longitude`)
- **menus** — itens do menu por restaurante (nome, descrição, preço, `categoria`, `alergenos`, disponível)
- **reservations** — reservas criadas pelos estudantes (estado, QR token, horário, modalidade, avaliação)

As colunas `saldo`, `latitude`, `longitude`, `categoria` e `alergenos` são adicionadas automaticamente por migrações no arranque do servidor, sem necessidade de intervenção manual.

---

## API

Todos os endpoints devolvem JSON. A base URL é `http://localhost:3000`.

### Autenticação

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /login | Login de utilizador |
| POST | /signup | Registo de estudante ou restaurante |

### Utilizadores

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /users/:id | Obtém dados do utilizador (nome, email, saldo) |
| PUT | /users/:id | Atualiza o nome do utilizador (Art. 16 RGPD) |
| PUT | /users/:id/password | Altera a password com verificação bcrypt |
| POST | /users/:id/topup | Carrega saldo na carteira digital |
| DELETE | /users/:id | Elimina conta e todos os dados em cascata (Art. 17 RGPD) |
| GET | /users/:id/export | Exporta todos os dados do utilizador em JSON (Art. 15/20 RGPD) |

### Restaurantes

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /restaurants | Lista todos os restaurantes (inclui coordenadas GPS) |
| GET | /restaurants/user/:userId | Obtém o restaurante associado a um utilizador |
| PUT | /restaurants/:id | Atualiza o perfil de um restaurante |

### Menu

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /menu/:restaurantId | Lista os itens disponíveis (inclui categoria e alergénios) |
| POST | /menu | Adiciona um item ao menu |
| PUT | /menu/:id | Edita um item do menu |
| DELETE | /menu/:id | Remove um item do menu (soft delete) |

### Reservas

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /reservations | Cria uma reserva |
| GET | /reservations/student/:studentId | Lista reservas de um estudante |
| GET | /reservations/restaurant/:restaurantId | Lista reservas de um restaurante |
| PUT | /reservations/:id/status | Atualiza o estado de uma reserva |
| POST | /reservations/:id/cancel | Cancela uma reserva pendente |
| PUT | /reservations/:id/rating | Avalia uma reserva após levantamento |
| POST | /reservations/validate | Valida um QR code e marca como levantada |

---

## Estados de uma reserva

`Pendente` -- `Confirmada` -- `Levantada` -- `Cancelada`

Apenas reservas com estado `Pendente` podem ser canceladas pelo estudante.

---

## Funcionalidades

**Área de estudantes**

- Login e registo de conta
- Listagem de restaurantes com horário, localização e avaliação média
- Mapa interativo (Leaflet.js + OpenStreetMap) com marcadores clicáveis por restaurante
- Visualização de todos os menus agrupados por restaurante, com alergénios destacados
- Criação de reserva com seleção de horário (Pequeno-almoço / Almoço / Jantar), item do menu e modalidade (take-away / no local)
- Vista "As Minhas Reservas" com filtros por estado e paginação
- Cancelamento de reservas pendentes
- Avaliação de reservas levantadas (1 a 5 estrelas)
- Sistema de notificações em tempo real (sino no header) para atualizações de estado
- Carteira UniFood com consulta de saldo e carregamento (€5 / €10 / €20)
- Página de Definições com edição de nome, alteração de password e opções RGPD

**Área de restaurantes**

- Login e registo de conta com nome, localização, horário e coordenadas GPS
- Painel de estatísticas com totais, gráfico semanal e distribuição por estado
- Listagem e filtro de reservas com pesquisa por nome ou senha
- Confirmação de reservas pendentes
- Validação por QR code (câmara ou inserção manual do token)
- Sistema de notificações com polling automático a cada 30 segundos para novas reservas e cancelamentos
- Gestão do menu: adicionar, editar e remover itens com categoria e alergénios
- Filtros de menu por categoria (Pratos, Bebidas, Sobremesas, Snacks)
- Edição do perfil do restaurante (nome, descrição, localização, contacto, horário)

---

## Conformidade RGPD

O sistema implementa os direitos dos titulares de dados mais exigidos em auditorias, exercíveis diretamente na aplicação sem contacto externo:

| Artigo | Direito | Implementação |
|--------|---------|---------------|
| Art. 13 | Transparência | Política de privacidade expansível nas Definições |
| Art. 15 + 20 | Acesso + Portabilidade | Download dos dados pessoais e reservas em JSON |
| Art. 16 | Retificação | Edição do nome nas Definições com atualização imediata |
| Art. 17 | Eliminação | Eliminação de conta com apagamento em cascata de todos os dados |

---

## Modo demo (servidor offline)

Se o servidor de API não estiver acessível, o frontend cai num modo de demonstração que usa `localStorage` e uma lista de utilizadores hardcoded em `config.js`. Neste modo as alterações não são persistidas na base de dados.

---

## Estrutura de ficheiros

```
server.js          API Express (porta 3000)
serve.js           Servidor de ficheiros estáticos (porta 8080)
config.js          URL da API e utilizadores demo
index.html         Página dos estudantes
index.js           Lógica da área de estudantes
style.css          Estilos da área de estudantes
restaurant.html    Painel do restaurante
restaurant.js      Lógica do painel do restaurante
restaurant.css     Estilos do painel do restaurante
seed.js            Script para popular a base de dados
imagens/           Imagens dos restaurantes
```
