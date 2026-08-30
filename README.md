# ⚔️ FFA FPS (Krunker Clone)

Um jogo de tiro em primeira pessoa (FPS) multiplayer no estilo **Free-For-All (FFA)** que roda direto no navegador, desenvolvido do zero com **Node.js**, **Socket.IO** e **Three.js**.

---

## 🚀 Tecnologias Utilizadas

- **Backend:** Node.js, Express, Socket.IO (WebSockets + Polling)
- **Frontend:** HTML5, CSS3, JavaScript puro (Vanilla JS)
- **Renderização 3D:** Three.js (WebGL com iluminação, modelos, colisões AABB e névoa)
- **Controles:** Pointer Lock API (mira no mouse e movimentação em 1ª pessoa)

---

## 🎮 Funcionalidades

- **Multiplayer em Tempo Real:** Sincronização de posições, rotação, disparos, dano e animações entre jogadores.
- **Sistema de Loadout:** Escolha 2 armas primárias/secundárias ao entrar (a faca vem sempre equipada).
- **Mecânicas de Movimento Avançadas:**
  - Pulo e *Bunny Hopping* (manutenção de momentum).
  - Gancho / *Grappling Hook* para movimentação vertical rápida.
- **Sistema de Combate Completo:**
  - Dano diferenciado por região (Tiro no Corpo vs. *Headshot*).
  - Indicador de acerto (*Hitmarkers*) e números de dano flutuantes.
  - Recuo de arma (*kickback*), recarga e animações em primeira pessoa (*viewmodel*).
- **Mapas e Rotação:**
  - 🏟️ **Arena Clássica:** Mapa simétrico focado em combates equilibrados.
  - 🏙️ **Cidade Pequena:** Construções, becos e combate vertical.
  - 🏜️ **Dunas do Deserto:** Espaços abertos e cobertura dinâmica.
- **Ciclo de Partida Completo:**
  - Partidas com temporizador (5 minutos).
  - *Killfeed* e Placar de líderes em tempo real (tecla `TAB`).
  - Tela de fim de partida e votação comunitária para o próximo mapa.
- **Convite Local / LAN:** Exibição do endereço IP local e botão para copiar link para jogar com amigos na mesma rede.

---

## 🔫 Arsenal de Armas

| Arma | Tipo | Dano (Corpo / Cabeça) | Cadência | Capacidade | Recarga |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Metralhadora (SMG)** | Automática | 18 / 36 | Rápida (110ms) | 30 balas | 2.0s |
| **Sniper** | Tiro Único | 60 / 999 (Hit Kill) | Lenta (1100ms) | 3 balas | 2.6s |
| **Pistolinha** | Semi-automática | 22 / 44 | Média (240ms) | 12 balas | 1.5s |
| **Grappling Hook** | Utilitário | 0 / 0 | 550ms | Infinito | Instantâneo |
| **Faca** | Melee | 40 / 80 | 450ms | Infinito | Instantâneo |

---

## 🕹️ Controles

| Tecla / Ação | Função |
| :--- | :--- |
| **W, A, S, D** | Movimentação do personagem |
| **Mouse** | Mirar (visão em primeira pessoa) |
| **Botão Esquerdo do Mouse** | Atirar / Usar faca ou gancho |
| **Espaço** | Pular / Bunny Hop |
| **R** | Recarregar arma |
| **1, 2, 3** | Trocar de arma (Arma 1, Arma 2, Faca) |
| **G** | Usar Grappling Hook rapidamente |
| **TAB (Segurar)** | Abrir placar de pontuação |
| **ESC** | Liberar o cursor do mouse |

---

## 📦 Como Instalar e Rodar Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 16 ou superior)
- `npm` (incluso no Node.js)

### Passo a passo

1. **Clone ou acesse a pasta do projeto:**
   ```bash
   cd fpsgame
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Inicie o servidor:**
   ```bash
   npm start
   ```

4. **Abra no navegador:**
   - Acesse: `http://localhost:3000`
   - Para testar o multiplayer, abra mais de uma aba ou janela anônima no navegador.
   - Para jogar com outras pessoas na mesma rede Wi-Fi/LAN, use o endereço IP mostrado no terminal ou no link de convite na tela inicial.

---

## 📁 Estrutura do Projeto

```
fpsgame/
├── public/                 # Arquivos estáticos do cliente (sem bundler)
│   ├── constants.js        # Definições de armas e configurações do cliente
│   ├── game.js             # Lógica do jogo (Three.js, inputs, HUD, Socket.IO)
│   ├── maps.js             # Construção procedural da geometria dos mapas e colisões
│   ├── index.html          # Interface, HUD e carregamento de scripts
│   └── style.css           # Estilos visuais da interface, overlays e HUD
├── server.js               # Servidor autoritativo Node.js / Socket.IO
├── package.json            # Dependências e scripts do Node.js
├── render.yaml             # Configuração para deploy no Render
└── AGENTS.md               # Diretrizes de desenvolvimento para agentes de IA
```

---

## ☁️ Deploy

O projeto já inclui o arquivo `render.yaml` configurado para deploy simples no [Render](https://render.com/) como um Web Service Node.js.

- **Comando de Build:** `npm ci`
- **Comando de Inicialização:** `npm start`
- **Health Check Path:** `/health`

---

## 📝 Licença

Este projeto é de código aberto para fins educacionais e de entretenimento.
