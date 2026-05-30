# UniFood

Sistema de reservas de refeições para o campus universitário do ISCTE. Permite que estudantes consultem restaurantes, façam reservas e levantem as refeições através de um QR code. Os restaurantes gerem o menu, confirmam reservas e validam levantamentos pelo painel de controlo.

---

## Arquitetura

O projeto é composto por dois servidores independentes e dois frontends em HTML/JS vanilla.

**Backend (server.js)** corre na porta 3000 com Express.js e persiste os dados numa base de dados MySQL chamada `unifood`.

**Servidor estático (serve.js)** corre na porta 8080 e serve os ficheiros HTML, CSS e JS do frontend.

**Área de estudantes** (index.html + index.js + style.css) permite login, consulta de restaurantes, criação e gestão de reservas.

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

- **users** - estudantes e contas de restaurante (role: `student` | `restaurant`)
- **restaurants** - perfil de cada restaurante (nome, localização, horário, contacto, descrição)
- **menus** - itens do menu por restaurante (nome, descrição, preço, disponível)
- **reservations** - reservas criadas pelos estudantes (estado, QR token, avaliação)

---

## API

Todos os endpoints devolvem JSON. A base URL é `http://localhost:3000`.

### Autenticação

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /login | Login de utilizador |
| POST | /signup | Registo de estudante ou restaurante |

### Restaurantes

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /restaurants | Lista todos os restaurantes |
| GET | /restaurants/user/:userId | Obtém o restaurante associado a um utilizador |
| PUT | /restaurants/:id | Atualiza o perfil de um restaurante |

### Menu

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /menu/:restaurantId | Lista os itens disponíveis de um restaurante |
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
| POST | /reservations/:id/cancel | Cancela uma reserva pendente (verifica o dono) |
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
- Listagem de restaurantes com horário e localização vindos da base de dados
- Consulta do menu de cada restaurante
- Criação de reserva com escolha de item e modalidade (take-away / local)
- Vista "As Minhas Reservas" com filtros por estado
- Cancelamento de reservas pendentes
- Avaliação de reservas levantadas (1 a 5 estrelas)

**Área de restaurantes**

- Login e registo de conta com nome, localização e horário
- Painel de estatísticas com totais, gráfico semanal e distribuição por estado
- Listagem e filtro de reservas com pesquisa por nome ou senha
- Confirmação de reservas pendentes
- Validação por QR code (inserção manual do token)
- Gestão do menu: adicionar, editar e remover itens
- Edição do perfil do restaurante (nome, descrição, localização, contacto, horário)

---

## Modo demo (servidor offline)

Se o servidor de API não estiver acessível, o frontend cai num modo de demonstração que usa `localStorage` e uma lista de utilizadores hardcoded em `config.js`. Neste modo as alterações não são persistidas na base de dados.

---

## Estrutura de ficheiros

```
server.js          API Express
serve.js           Servidor de ficheiros estáticos
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
