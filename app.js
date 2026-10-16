(function () {
  'use strict';
  const { PokerGame, cardText } = window.Poker;
  const game = new PokerGame();
  const $ = id => document.getElementById(id);
  const phaseNames = { preflop: '底牌轮', flop: '翻牌轮', turn: '转牌轮', river: '河牌轮', showdown: '本手结束', gameover: '对局结束' };
  const number = value => Number(value).toLocaleString('zh-CN');
  let aiTimer = null;
  let raiseTotal = 0;
  let revealAll = false;

  function cardHtml(card, hidden = false, compact = false) {
    if (!card) return `<div class="playing-card empty ${compact ? 'compact' : ''}" aria-hidden="true"></div>`;
    if (hidden) return `<div class="playing-card back ${compact ? 'compact' : ''}" aria-label="暗牌"><span>♠</span></div>`;
    const red = card.suit === '♥' || card.suit === '♦';
    return `<div class="playing-card face ${red ? 'red' : 'black'} ${compact ? 'compact' : ''}" aria-label="${cardText(card)}"><span class="card-rank">${card.rank >= 11 ? { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[card.rank] : card.rank}</span><span class="card-suit">${card.suit}</span></div>`;
  }

  function renderSeat(player) {
    const isTurn = game.currentActor === player.seat;
    const reveal = (game.phase === 'showdown' && !player.folded && game.lastResult?.type === 'showdown') || ((game.phase === 'showdown' || game.phase === 'gameover') && revealAll);
    const cards = player.inHand ? player.cards.map(card => cardHtml(card, player.seat !== 0 && !reveal, true)).join('') : '';
    const badges = [game.dealer === player.seat && player.inHand ? '<span class="dealer-badge">D</span>' : '', game.smallBlindSeat === player.seat && player.inHand ? '<span class="blind-badge">SB</span>' : '', game.bigBlindSeat === player.seat && player.inHand ? '<span class="blind-badge">BB</span>' : ''].join('');
    const state = player.folded && player.inHand ? 'folded' : player.stack === 0 && player.inHand ? 'busted' : '';
    const action = player.inHand && player.lastAction ? `<span class="seat-action">${player.lastAction}</span>` : (!player.inHand && player.stack === 0 ? '<span class="seat-action">出局</span>' : '');
    const bet = player.roundBet ? `<span class="seat-bet"><i class="chip-mini"></i>${number(player.roundBet)}</span>` : '';
    $('seat' + player.seat).className = `player-seat seat-${['bottom', 'left', 'top', 'right'][player.seat]} ${isTurn ? 'active' : ''} ${state} ${reveal && revealAll ? 'revealed' : ''}`;
    $('seat' + player.seat).innerHTML = `<div class="seat-cards">${cards}</div><div class="seat-info"><div class="avatar ${player.style}">${player.avatar}</div><div class="seat-copy"><div class="seat-name">${player.name}${badges}</div><div class="seat-stack"><span class="chip-mini"></span>${number(player.stack)}</div></div>${action}</div>${bet}`;
  }

  function renderCommunity() {
    $('communityCards').innerHTML = Array.from({ length: 5 }, (_, index) => cardHtml(game.community[index])).join('');
  }

  function renderScoreboard() {
    const ranks = [...game.players].sort((a, b) => b.stack - a.stack);
    $('scoreboard').innerHTML = ranks.map((player, index) => `<div class="score-row ${player.seat === 0 ? 'your-row' : ''}"><span class="score-rank">0${index + 1}</span><div class="score-avatar ${player.style}">${player.avatar}</div><span class="score-name">${player.name}${player.seat === 0 ? '<small>YOU</small>' : ''}</span><strong>${number(player.stack)}</strong></div>`).join('');
  }

  function renderHistory() {
    $('historyList').innerHTML = game.log.length ? game.log.map((entry, index) => `<div class="history-item ${index === 0 ? 'latest' : ''}"><span class="history-mark"></span><span>${entry}</span></div>`).join('') : '<div class="history-empty">发牌后，这里会记录每一步。</div>';
  }

  function renderReview() {
    const finished = game.phase === 'showdown' || game.phase === 'gameover';
    $('reviewPanel').hidden = !finished || !revealAll;
    $('revealButton').textContent = revealAll ? '收起底牌复盘' : '查看所有人底牌';
    $('revealButton').setAttribute('aria-expanded', String(finished && revealAll));
    $('revealButton').setAttribute('aria-pressed', String(finished && revealAll));
    if (!finished || !revealAll) return;
    const street = { preflop: '底牌', flop: '翻牌', turn: '转牌', river: '河牌' };
    const rows = game.players.filter(player => player.inHand).map(player => {
      const moves = game.handActions.filter(move => move.seat === player.seat)
        .map(move => `${street[move.phase]} ${move.text}`).join(' · ');
      const outcome = game.lastResult?.winners.includes(player.seat) ? '本手获胜' : player.folded ? '已弃牌' : '参与摊牌';
      return `<div class="review-row"><div class="review-person"><span class="score-avatar ${player.style}">${player.avatar}</span><span><strong>${player.name}</strong><small>${outcome}</small></span></div><div class="review-cards">${player.cards.map(card => cardHtml(card, false, true)).join('')}</div><div class="review-moves">${moves || '本手未行动'}</div></div>`;
    }).join('');
    $('reviewPanel').innerHTML = `<div class="review-title"><span class="section-kicker">HAND REVIEW</span><strong>本手底牌与行动</strong></div>${rows}`;
  }

  function setRaise(value) {
    const legal = game.legalActions(0);
    if (!legal || !legal.canFullRaise) return;
    raiseTotal = Math.max(legal.minTotal, Math.min(legal.maxTotal, Math.round(Number(value) / 10) * 10));
    $('raiseSlider').value = raiseTotal;
    $('raiseAmount').textContent = number(raiseTotal);
  }

  function renderActions() {
    const legal = game.legalActions(0);
    const finished = game.phase === 'showdown' || game.phase === 'gameover';
    $('actionControls').hidden = finished;
    $('nextHandControls').hidden = !finished;
    $('heroStack').textContent = number(game.players[0].stack);
    if (finished) {
      const result = game.lastResult;
      $('actionTitle').textContent = game.phase === 'gameover' ? '对局结束' : '本手结束';
      $('resultText').textContent = game.phase === 'gameover' ? `${game.players.find(player => player.stack > 0)?.name || '无人'} 赢得本场对局。` : (result?.message || '本手结束');
      $('nextHandButton').textContent = game.phase === 'gameover' ? '重新开始 →' : '开始下一手 →';
      return;
    }
    $('actionTitle').textContent = legal ? (legal.toCall ? `轮到你了 · 跟注 ${number(legal.callAmount)}` : '轮到你了 · 可以过牌') : '等待电脑玩家行动';
    $('foldButton').disabled = !legal;
    $('callButton').disabled = !legal;
    $('raiseButton').disabled = !legal?.canFullRaise;
    $('allinButton').disabled = !legal?.canRaise;
    $('callButton').innerHTML = legal?.toCall ? `跟注 ${number(legal.callAmount)} <span>SPACE</span>` : '过牌 <span>SPACE</span>';
    $('raiseSlider').disabled = !legal?.canFullRaise;
    document.querySelectorAll('[data-preset]').forEach(button => { button.disabled = !legal?.canFullRaise; });
    if (legal?.canFullRaise) {
      $('raiseSlider').min = legal.minTotal;
      $('raiseSlider').max = legal.maxTotal;
      if (raiseTotal < legal.minTotal || raiseTotal > legal.maxTotal) raiseTotal = legal.minTotal;
      setRaise(raiseTotal);
    } else {
      $('raiseAmount').textContent = '—';
    }
  }

  function render() {
    game.players.forEach(renderSeat);
    renderCommunity();
    renderScoreboard();
    renderHistory();
    renderActions();
    renderReview();
    $('potAmount').textContent = number(game.pot());
    $('phaseLabel').textContent = phaseNames[game.phase] || '底牌轮';
    $('handNumber').textContent = '#' + String(game.handNumber).padStart(2, '0');
    $('blindLabel').textContent = `盲注 ${game.smallBlind} / ${game.bigBlind}`;
    $('turnStatus').textContent = game.phase === 'showdown' ? '点击开始下一手' : game.phase === 'gameover' ? '本场对局结束' : game.currentActor === 0 ? '轮到你行动' : `${game.players[game.currentActor]?.name || '电脑'} 正在思考`;
    scheduleAi();
  }

  function scheduleAi() {
    clearTimeout(aiTimer);
    if (game.currentActor === null || game.currentActor === 0 || game.phase === 'showdown') return;
    const hand = game.handNumber;
    const seat = game.currentActor;
    aiTimer = setTimeout(() => {
      if (game.handNumber !== hand || game.currentActor !== seat) return;
      const move = window.PokerAI.chooseAction(game, seat);
      try { game.act(seat, move.action, move.total); render(); }
      catch (error) { console.error(error); game.act(seat, 'call'); render(); }
    }, 680 + Math.random() * 460);
  }

  function doAction(action, total) {
    if (!game.legalActions(0)) return;
    try { game.act(0, action, total); raiseTotal = 0; render(); }
    catch (error) { console.error(error); }
  }

  $('foldButton').addEventListener('click', () => doAction('fold'));
  $('callButton').addEventListener('click', () => doAction('call'));
  $('raiseButton').addEventListener('click', () => doAction('raise', raiseTotal));
  $('allinButton').addEventListener('click', () => doAction('allin'));
  $('raiseSlider').addEventListener('input', event => setRaise(event.target.value));
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    const legal = game.legalActions(0);
    if (!legal?.canFullRaise) return;
    const preset = button.dataset.preset;
    const desired = preset === 'max' ? legal.maxTotal : game.currentBet + Math.max(game.minRaise, Math.round(game.pot() * (preset === 'half' ? 0.5 : 1) / 10) * 10);
    setRaise(desired);
  }));
  $('revealButton').addEventListener('click', () => { revealAll = !revealAll; render(); });
  $('nextHandButton').addEventListener('click', () => { revealAll = false; if (game.phase === 'gameover') game.reset(); else game.startHand(); raiseTotal = 0; render(); });
  $('rulesButton').addEventListener('click', () => $('rulesDialog').showModal());
  $('restartButton').addEventListener('click', () => $('restartDialog').showModal());
  $('confirmRestart').addEventListener('click', () => { $('restartDialog').close(); clearTimeout(aiTimer); revealAll = false; game.reset(); raiseTotal = 0; render(); });
  document.addEventListener('keydown', event => {
    if (document.querySelector('dialog[open]') || event.target instanceof HTMLInputElement) return;
    if (event.key.toLowerCase() === 'f' && game.legalActions(0)) doAction('fold');
    if (event.code === 'Space' && game.legalActions(0)) { event.preventDefault(); doAction('call'); }
  });
  game.startHand();
  render();
})();
