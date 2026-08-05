# Carrossel "A chave que cai" — SMQ

Carrossel de 2 vídeos para Instagram em que a chave é solta no card 1, sai pela
borda de baixo e entra no card 2 pelo topo, na mesma posição e na mesma
velocidade — a continuidade entre os cards é o que força o swipe.

Referência do formato: post do @realmrpatty (queijo escorre do card 1 e cai no
mascote do card 2). O que faz esse formato funcionar:

1. A continuidade física entre os cards obriga o swipe, que o algoritmo lê como
   interação forte.
2. O payoff do card 2 é a **marca**, não a oferta. Sem preço, sem CTA na arte.
3. Legenda curta e sem explicação da piada.
4. Fundo limpo e um único elemento em movimento.
5. O KPI é compartilhamento, não curtida.

O erro que mata a peça é enfiar oferta no card 2. A conversão mora no comentário
fixado, nunca na arte.

## Arquivos

| arquivo | o que é |
| --- | --- |
| `out/smq-carrossel-chave-card1.mp4` | card 1 — a mão solta a chave |
| `out/smq-carrossel-chave-card2.mp4` | card 2 — a mão recebe + estouro dourado |
| `out/capa-card1.png`, `out/capa-card2.png` | frames estáticos, para thumbnail |
| `carousel.html` | a animação inteira (canvas 2D) |
| `shoot.mjs` | renderiza os frames PNG |
| `encode.sh` | monta os MP4 |
| `seam.mjs` | empilha os dois cards no mesmo instante para conferir a costura |

Especificação dos vídeos: 1080×1350 (4:5), H.264 High, yuv420p, 30 fps, 10,2s
(o loop de 3,4s repetido 3×), com faixa de áudio muda.

## Como postar

1. Carrossel comum no feed — **não** é Reels.
2. Card 1 primeiro, card 2 em segundo. A ordem é o post inteiro.
3. No corte, escolher **4:5**, não 1:1. O Instagram aplica o formato do primeiro
   item a todos; se sair em 1:1 ele corta o topo e o pé, a chave "pula" na
   costura e a ilusão morre.
4. Não adicionar moldura, borda nem legenda queimada na arte.

## Legenda

> Esse barulhinho da chave caindo na mão 🔑

Alternativas, se quiser testar:

> A chave caindo na mão certa 🔑
>
> Cai a ficha, cai a chave 🔑

## Comentário fixado (o CTA fica aqui)

> Se você quer que a próxima chave seja a sua: chama no WhatsApp que a gente
> simula sua faixa do MCMV em 5 minutos, sem custo. 👉 [link]

## Como regerar

```bash
npm i playwright ffmpeg-static     # o Chromium do ambiente já serve
node shoot.mjs preview             # amostras dos instantes-chave
node shoot.mjs && ./encode.sh      # render completo + MP4
node seam.mjs 1.017                # confere o alinhamento na costura
```

Os parâmetros ficam todos no bloco de constantes no topo de `carousel.html`:
duração do loop, número de chaves por volta, tempos de cada fase, ângulos e o
ponto onde a ponta encosta na palma. As cores saem dos tokens de marca de
`src/styles.css` (navy `oklch(0.32 0.06 250)`, dourado `oklch(0.72 0.12 85)`).

Duas armadilhas que já custaram retrabalho, caso alguém mexa:

- **Não** resolva os tokens oklch com `getComputedStyle().color` — o Chromium
  devolve a string `oklch()` intacta e o parser lê os três números como RGB
  (o resultado vira um roxo). Use o `toRGB()` do arquivo, que pinta 1px no
  canvas e lê o pixel.
- As camadas de luz precisam de `ctx.filter = blur(...)`. Sem o blur, os raios
  viram barras chapadas e o anel de impacto vira uma roda desenhada.
