# ⚔️ FFA FPS 

Um jogo de tiro em primeira pessoa (FPS) multiplayer no estilo **Free-For-All (FFA)** que roda direto no navegador, desenvolvido do zero com **Node.js**, **Socket.IO** e **Three.js**.

https://ffa-fps-krunker.onrender.com/
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

Escolha 2 armas no loadout (com prévia 3D de cada uma); a faca é sempre o slot 3.

| Arma | Tipo | Dano (Corpo / Cabeça) | Cadência | Pente | Recarga |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Metralhadora (SMG)** | Automática | 18 / 36 | 110ms | 30 | 2.0s |
| **Fuzil de Assalto** | Automática | 22 / 44 | 135ms | 26 | 2.2s |
| **Sniper** | Precisão (mira telescópica) | 60 / 100 | 1100ms | 3 | 2.6s |
| **Escopeta** | 8 chumbos, dano cai com a distância | 11 / 16 por chumbo | 800ms | 6 | 2.4s |
| **Pistolinha** | Secundária | 22 / 44 | 240ms | 12 | 1.5s |
| **Revólver** | Secundária pesada | 45 / 90 | 560ms | 6 | 2.1s |
| **Gancho** | Utilitário com física de corda | — | 350ms | ∞ | — |
| **Faca** | Corpo a corpo | 40 / 80 | 450ms | ∞ | — |

A dispersão aumenta andando e pulando e diminui mirando ou agachado; cada arma tem recuo próprio.

---

## 🕹️ Controles

| Tecla / Ação | Função |
| :--- | :--- |
| **W, A, S, D** | Mover |
| **Espaço (segure)** | Pular / bunny hop automático |
| **A/D + mouse no ar** | Air strafe (ganha velocidade no bhop) |
| **Shift** | Agachar; correndo vira slide |
| **Botão esquerdo** | Atirar / faca / disparar o gancho |
| **Segurar clique (gancho)** | Fica preso e balança como pêndulo; soltar mantém o impulso |
| **Espaço (no gancho)** | Solta o gancho com impulso para cima |
| **Botão direito** | Mirar (ADS) |
| **R** | Recarregar |
| **1, 2, 3 / roda do mouse / Q** | Trocar arma (Q = última arma) |
| **G** | Equipar o gancho |
| **B** | Trocar o loadout durante a partida |
| **P** | Reiniciar (renasce após o tempo de respawn) |
| **TAB (segurar)** | Placar |

Todas as teclas, sensibilidade, FOV e sombras podem ser alteradas em ⚙️ Configurações.

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
│   ├── constants.js        # Armas (atributos, dispersão, recuo) e informações dos mapas
│   ├── weapons.js          # Modelos 3D das armas e prévias (fotos) de armas e mapas
│   ├── textures.js         # Texturas procedurais e céu
│   ├── effects.js          # Partículas, marcas de tiro, rastros, clarão e corpos
│   ├── audio.js            # Sons sintetizados (Web Audio)
│   ├── ui.js               # HUD, cartões de armas, votação, placar e telas
│   ├── game.js             # Lógica do jogo (Three.js, inputs, HUD, Socket.IO)
│   ├── maps.js             # Construção procedural da geometria dos mapas e colisões
│   ├── index.html          # Interface, HUD e carregamento de scripts
│   └── style.css           # Estilos visuais da interface, overlays e HUD
├── lib/mapObstacles.js     # Extrai as colisões de public/maps.js para o servidor
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
