(function (root) {
  'use strict';
  const { makeDeck, shuffle, evaluate, compareScores } = root.Poker;

  function preflopStrength(cards) {
    const high = Math.max(cards[0].rank, cards[1].rank);
    const low = Math.min(cards[0].rank, cards[1].rank);
    const pair = high === low;
    const suited = cards[0].suit === cards[1].suit;
    const gap = high - low;
    let strength = pair ? 0.5 + high / 31 : (high + low) / 39;
    if (suited) strength += 0.08;
    if (!pair && gap <= 2) strength += 0.055;
    if (high === 14) strength += 0.055;
    if (gap >= 5 && low < 10) strength -= 0.07;
    return Math.min(0.98, Math.max(0.15, strength));
  }

  function sampledEquity(game, seat, samples = 44) {
    const player = game.players[seat];
    const opponents = game.livePlayers().filter(other => other.seat !== seat).length;
    const known = [...player.cards, ...game.community];
    const knownKeys = new Set(known.map(card => `${card.rank}${card.suit}`));
    const pool = makeDeck().filter(card => !knownKeys.has(`${card.rank}${card.suit}`));
    let points = 0;
    for (let sample = 0; sample < samples; sample++) {
      shuffle(pool, game.random);
      let cursor = 0;
      const board = [...game.community];
      while (board.length < 5) board.push(pool[cursor++]);
      const ours = evaluate([...player.cards, ...board]);
      let wins = true;
      let ties = 0;
      for (let rival = 0; rival < opponents; rival++) {
        const theirs = evaluate([pool[cursor++], pool[cursor++], ...board]);
        const comparison = compareScores(ours, theirs);
        if (comparison < 0) { wins = false; break; }
        if (comparison === 0) ties++;
      }
      if (wins) points += 1 / (ties + 1);
    }
    return points / samples;
  }

  function chooseAction(game, seat) {
    const legal = game.legalActions(seat);
    if (!legal) return null;
    const player = game.players[seat];
    const random = game.random;
    const personality = [{ aggression: 0, tightness: 0 }, { aggression: 0.13, tightness: 0.02 }, { aggression: 0.02, tightness: 0.08 }, { aggression: 0.1, tightness: 0.05 }][seat];
    const equity = game.phase === 'preflop' ? preflopStrength(player.cards) : sampledEquity(game, seat);
    const potOdds = legal.toCall / Math.max(1, game.pot() + legal.toCall);
    const adjusted = equity + personality.aggression - personality.tightness;
    const pressure = legal.toCall / Math.max(1, player.stack + legal.toCall);
    const isPremium = game.phase === 'preflop' ? equity > 0.79 : equity > 0.72;
    const canBet = legal.canRaise && legal.maxTotal > game.currentBet;

    if (legal.toCall === 0) {
      if (canBet && (adjusted > 0.67 || (adjusted > 0.46 && random() < 0.22))) {
        const desired = game.currentBet + Math.max(game.minRaise, Math.round((game.pot() * (0.38 + random() * 0.35)) / 10) * 10);
        const total = Math.min(legal.maxTotal, Math.max(legal.minTotal, desired));
        if (total <= legal.maxTotal) return { action: 'raise', total };
        return { action: 'allin' };
      }
      return { action: 'check' };
    }

    if (canBet && (isPremium || adjusted > 0.84) && random() < (isPremium ? 0.68 : 0.38)) {
      const desired = game.currentBet + Math.max(game.minRaise, Math.round((game.pot() * (0.45 + random() * 0.45)) / 10) * 10);
      const total = Math.min(legal.maxTotal, Math.max(legal.minTotal, desired));
      if (total <= legal.maxTotal) return { action: 'raise', total };
      return { action: 'allin' };
    }
    const tolerance = game.phase === 'preflop' ? 0.22 : 0.07;
    if (adjusted + tolerance >= potOdds && (pressure < 0.36 || adjusted > 0.68 || legal.callAmount < game.bigBlind * 2)) return { action: 'call' };
    if (legal.callAmount === player.stack && adjusted > potOdds + 0.08) return { action: 'call' };
    return { action: 'fold' };
  }

  const api = { chooseAction, preflopStrength, sampledEquity };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PokerAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
