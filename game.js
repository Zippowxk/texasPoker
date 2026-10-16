(function (root) {
  'use strict';

  const SUITS = ['♠', '♥', '♣', '♦'];
  const RANKS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const HAND_NAMES = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];

  function cardText(card) {
    return `${RANKS[card.rank] || card.rank}${card.suit}`;
  }

  function makeDeck() {
    return SUITS.flatMap(suit => Array.from({ length: 13 }, (_, i) => ({ rank: i + 2, suit })));
  }

  function shuffle(deck, random = Math.random) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function compareScores(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const difference = (a[i] || 0) - (b[i] || 0);
      if (difference) return difference;
    }
    return 0;
  }

  function evaluateFive(cards) {
    const ranks = cards.map(card => card.rank).sort((a, b) => b - a);
    const counts = new Map();
    ranks.forEach(rank => counts.set(rank, (counts.get(rank) || 0) + 1));
    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const flush = cards.every(card => card.suit === cards[0].suit);
    const unique = [...new Set(ranks)];
    if (unique.includes(14)) unique.push(1);
    let straightHigh = 0;
    for (let i = 0; i <= unique.length - 5; i++) {
      if (unique[i] - unique[i + 4] === 4) {
        straightHigh = unique[i];
        break;
      }
    }
    if (flush && straightHigh) return [8, straightHigh];
    if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
    if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
    if (flush) return [5, ...ranks];
    if (straightHigh) return [4, straightHigh];
    if (groups[0][1] === 3) return [3, groups[0][0], ...groups.slice(1).map(group => group[0]).sort((a, b) => b - a)];
    if (groups[0][1] === 2 && groups[1][1] === 2) {
      const pairs = groups.filter(group => group[1] === 2).map(group => group[0]).sort((a, b) => b - a);
      return [2, ...pairs, groups.find(group => group[1] === 1)[0]];
    }
    if (groups[0][1] === 2) return [1, groups[0][0], ...groups.slice(1).map(group => group[0]).sort((a, b) => b - a)];
    return [0, ...ranks];
  }

  function evaluate(cards) {
    if (cards.length < 5) throw new Error('至少需要 5 张牌');
    let best = null;
    for (let a = 0; a < cards.length - 4; a++)
      for (let b = a + 1; b < cards.length - 3; b++)
        for (let c = b + 1; c < cards.length - 2; c++)
          for (let d = c + 1; d < cards.length - 1; d++)
            for (let e = d + 1; e < cards.length; e++) {
              const score = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
              if (!best || compareScores(score, best) > 0) best = score;
            }
    return best;
  }

  class PokerGame {
    constructor(options = {}) {
      this.random = options.random || Math.random;
      this.bigBlind = options.bigBlind || 20;
      this.smallBlind = this.bigBlind / 2;
      this.startingStack = options.startingStack || 2000;
      this.players = [
        { name: '你', style: 'hero', avatar: '你' },
        { name: '阿杰', style: 'blue', avatar: '杰' },
        { name: 'Mia', style: 'pink', avatar: 'M' },
        { name: '老周', style: 'orange', avatar: '周' }
      ].map((player, seat) => ({ ...player, seat, stack: this.startingStack, cards: [], folded: false, inHand: false, totalBet: 0, roundBet: 0, lastAction: '' }));
      this.dealer = -1;
      this.handNumber = 0;
      this.phase = 'ready';
      this.currentActor = null;
      this.community = [];
      this.log = [];
      this.handActions = [];
      this.lastResult = null;
      this.actedSinceFullRaise = new Set();
    }

    activeSeats() { return this.players.filter(player => player.stack > 0).map(player => player.seat); }
    nextSeat(after, seats) {
      for (let offset = 1; offset <= this.players.length; offset++) {
        const seat = (after + offset + this.players.length) % this.players.length;
        if (seats.includes(seat)) return seat;
      }
      return null;
    }
    note(message) { this.log.unshift(message); this.log = this.log.slice(0, 14); }
    pot() { return this.players.reduce((sum, player) => sum + player.totalBet, 0); }
    livePlayers() { return this.players.filter(player => player.inHand && !player.folded); }
    actingPlayers() { return this.livePlayers().filter(player => player.stack > 0); }
    commit(player, amount) {
      const paid = Math.min(player.stack, Math.max(0, Math.floor(amount)));
      player.stack -= paid;
      player.roundBet += paid;
      player.totalBet += paid;
      return paid;
    }

    startHand() {
      const seats = this.activeSeats();
      if (seats.length < 2) {
        this.phase = 'gameover';
        this.currentActor = null;
        return false;
      }
      this.handNumber++;
      this.dealer = this.nextSeat(this.dealer, seats);
      this.phase = 'preflop';
      this.community = [];
      this.deck = shuffle(makeDeck(), this.random);
      this.currentBet = this.bigBlind;
      this.minRaise = this.bigBlind;
      this.actedSinceFullRaise.clear();
      this.handActions = [];
      this.lastResult = null;
      this.players.forEach(player => {
        player.inHand = seats.includes(player.seat);
        player.folded = false;
        player.cards = player.inHand ? [this.deck.pop(), this.deck.pop()] : [];
        player.totalBet = 0;
        player.roundBet = 0;
        player.lastAction = '';
      });
      const sb = seats.length === 2 ? this.dealer : this.nextSeat(this.dealer, seats);
      const bb = this.nextSeat(sb, seats);
      this.smallBlindSeat = sb;
      this.bigBlindSeat = bb;
      this.commit(this.players[sb], this.smallBlind);
      this.commit(this.players[bb], this.bigBlind);
      this.players[sb].lastAction = '小盲';
      this.players[bb].lastAction = '大盲';
      this.note(`第 ${this.handNumber} 手 · 盲注 ${this.smallBlind}/${this.bigBlind}`);
      this.note(`${this.players[sb].name} 下小盲 ${this.players[sb].roundBet}，${this.players[bb].name} 下大盲 ${this.players[bb].roundBet}`);
      this.currentActor = this.findNextActor(bb);
      this.progress();
      return true;
    }

    legalActions(seat = this.currentActor) {
      const player = this.players[seat];
      if (seat == null || seat !== this.currentActor || !player || player.folded || player.stack === 0) return null;
      const toCall = Math.max(0, this.currentBet - player.roundBet);
      const maxTotal = player.roundBet + player.stack;
      const minTotal = this.currentBet + this.minRaise;
      const canRaise = !this.actedSinceFullRaise.has(seat) && maxTotal > this.currentBet;
      return { toCall, callAmount: Math.min(toCall, player.stack), maxTotal, minTotal, canRaise, canCheck: toCall === 0, canFullRaise: canRaise && maxTotal >= minTotal };
    }

    act(seat, action, total) {
      const legal = this.legalActions(seat);
      if (!legal) throw new Error('现在还不能行动');
      const player = this.players[seat];
      if (action === 'fold') {
        player.folded = true;
        player.lastAction = '弃牌';
      } else if (action === 'call' || action === 'check') {
        if (action === 'check' && legal.toCall !== 0) throw new Error('必须跟注或弃牌');
        const paid = this.commit(player, legal.callAmount);
        player.lastAction = legal.toCall ? (player.stack === 0 ? `跟注 · 全下 ${paid}` : `跟注 ${paid}`) : '过牌';
      } else if (action === 'raise' || action === 'allin') {
        const target = action === 'allin' ? legal.maxTotal : Number(total);
        if (!Number.isInteger(target) || target > legal.maxTotal || target <= this.currentBet || !legal.canRaise) throw new Error('加注金额无效');
        if (target < legal.minTotal && target !== legal.maxTotal) throw new Error(`最小加注至 ${legal.minTotal}`);
        const previousBet = this.currentBet;
        this.commit(player, target - player.roundBet);
        this.currentBet = target;
        if (target - previousBet >= this.minRaise) {
          this.minRaise = target - previousBet;
          this.actedSinceFullRaise.clear();
        }
        player.lastAction = player.stack === 0 ? `全下 ${target}` : `加注至 ${target}`;
      } else {
        throw new Error('未知操作');
      }
      this.actedSinceFullRaise.add(seat);
      this.handActions.push({ seat, phase: this.phase, text: player.lastAction });
      this.note(`${player.name} ${player.lastAction}`);
      this.currentActor = this.findNextActor(seat);
      this.progress();
    }

    findNextActor(after) {
      for (let offset = 1; offset <= this.players.length; offset++) {
        const seat = (after + offset) % this.players.length;
        const player = this.players[seat];
        if (player.inHand && !player.folded && player.stack > 0 &&
            (!this.actedSinceFullRaise.has(seat) || player.roundBet < this.currentBet)) return seat;
      }
      return null;
    }

    progress() {
      while (true) {
        const live = this.livePlayers();
        if (live.length === 1) {
          const winner = live[0];
          const amount = this.pot();
          winner.stack += amount;
          this.lastResult = { type: 'fold', winners: [winner.seat], amount, message: `${winner.name} 赢得底池 ${amount}` };
          this.note(this.lastResult.message);
          this.phase = 'showdown';
          this.currentActor = null;
          return;
        }
        const ableToAct = this.actingPlayers();
        if (ableToAct.length === 1 && ableToAct[0].roundBet >= this.currentBet) this.currentActor = null;
        if (this.currentActor !== null) return;
        if (this.phase === 'river') return this.showdown();
        this.advanceStreet();
        this.currentActor = this.findNextActor(this.dealer);
      }
    }

    advanceStreet() {
      this.deck.pop(); // Burn one card before each community deal.
      if (this.phase === 'preflop') {
        this.phase = 'flop';
        this.community.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
        this.note(`翻牌：${this.community.map(cardText).join(' ')}`);
      } else if (this.phase === 'flop') {
        this.phase = 'turn';
        this.community.push(this.deck.pop());
        this.note(`转牌：${cardText(this.community[3])}`);
      } else if (this.phase === 'turn') {
        this.phase = 'river';
        this.community.push(this.deck.pop());
        this.note(`河牌：${cardText(this.community[4])}`);
      }
      this.players.forEach(player => { player.roundBet = 0; player.lastAction = ''; });
      this.currentBet = 0;
      this.minRaise = this.bigBlind;
      this.actedSinceFullRaise.clear();
    }

    showdown() {
      const pot = this.pot();
      const scores = new Map(this.livePlayers().map(player => [player.seat, evaluate([...player.cards, ...this.community])]));
      const levels = [...new Set(this.players.filter(player => player.totalBet > 0).map(player => player.totalBet))].sort((a, b) => a - b);
      let previous = 0;
      const awards = new Map();
      for (const level of levels) {
        const contributors = this.players.filter(player => player.totalBet >= level);
        const layer = (level - previous) * contributors.length;
        const contenders = contributors.filter(player => !player.folded && player.inHand);
        let best = null;
        for (const player of contenders) {
          const score = scores.get(player.seat);
          if (!best || compareScores(score, best) > 0) best = score;
        }
        const winners = contenders.filter(player => compareScores(scores.get(player.seat), best) === 0)
          .sort((a, b) => ((a.seat - this.dealer + this.players.length) % this.players.length) - ((b.seat - this.dealer + this.players.length) % this.players.length));
        const share = Math.floor(layer / winners.length);
        winners.forEach((winner, index) => awards.set(winner.seat, (awards.get(winner.seat) || 0) + share + (index < layer % winners.length ? 1 : 0)));
        previous = level;
      }
      awards.forEach((amount, seat) => { this.players[seat].stack += amount; });
      const winners = [...awards.keys()].sort((a, b) => (awards.get(b) - awards.get(a)));
      const details = winners.map(seat => `${this.players[seat].name} ${HAND_NAMES[scores.get(seat)[0]]} +${awards.get(seat)}`);
      this.lastResult = { type: 'showdown', winners, awards: Object.fromEntries(awards), scores: Object.fromEntries(scores), amount: pot, message: details.join(' · ') };
      this.note(`摊牌：${this.lastResult.message}`);
      this.phase = 'showdown';
      this.currentActor = null;
    }

    reset() {
      this.players.forEach(player => { player.stack = this.startingStack; });
      this.dealer = -1;
      this.handNumber = 0;
      this.log = [];
      this.startHand();
    }
  }

  const api = { PokerGame, makeDeck, shuffle, evaluateFive, evaluate, compareScores, cardText, HAND_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Poker = api;
})(typeof window !== 'undefined' ? window : globalThis);
