const test = require('node:test');
const assert = require('node:assert/strict');
const { PokerGame, evaluate, compareScores } = require('./game.js');

const C = (rank, suit) => ({ rank, suit });

test('牌型识别：A-5 顺子和同花顺', () => {
  const wheel = evaluate([C(14, '♠'), C(2, '♠'), C(3, '♠'), C(4, '♠'), C(5, '♠'), C(13, '♥'), C(12, '♦')]);
  const higher = evaluate([C(6, '♥'), C(5, '♥'), C(4, '♥'), C(3, '♥'), C(2, '♥'), C(13, '♣'), C(12, '♦')]);
  assert.deepEqual(wheel, [8, 5]);
  assert.equal(compareScores(higher, wheel) > 0, true);
});

test('牌型识别：七张牌中选最佳五张', () => {
  const score = evaluate([C(14, '♠'), C(14, '♥'), C(14, '♦'), C(13, '♠'), C(13, '♥'), C(13, '♦'), C(2, '♣')]);
  assert.deepEqual(score, [6, 14, 13]);
});

test('不同筹码的全下形成主池和边池', () => {
  const game = new PokerGame();
  game.startHand();
  game.community = [C(2, '♣'), C(3, '♦'), C(4, '♥'), C(9, '♠'), C(13, '♣')];
  const cards = [[C(5, '♣'), C(6, '♣')], [C(13, '♥'), C(13, '♦')], [C(14, '♣'), C(14, '♦')], [C(8, '♣'), C(8, '♦')]];
  game.players.forEach((player, seat) => {
    player.cards = cards[seat];
    player.stack = seat === 0 ? 1900 : 1700;
    player.totalBet = seat === 0 ? 100 : 300;
    player.inHand = true;
    player.folded = seat === 3;
  });
  game.showdown();
  assert.equal(game.players[0].stack, 2300);
  assert.equal(game.players[1].stack, 2300);
  assert.equal(game.players[2].stack, 1700);
  assert.equal(game.players[3].stack, 1700);
  assert.equal(game.players.reduce((sum, player) => sum + player.stack, 0), 8000);
});

test('不足最小加注的全下不会重新开放加注', () => {
  const game = new PokerGame();
  game.startHand();
  game.act(3, 'raise', 60);
  game.act(0, 'call');
  game.act(1, 'call');
  game.players[2].stack = 50;
  game.act(2, 'allin');
  assert.equal(game.currentBet, 70);
  assert.equal(game.currentActor, 3);
  assert.equal(game.legalActions(3).toCall, 10);
  assert.equal(game.legalActions(3).canRaise, false);
});

test('本手操作可复盘，已弃牌玩家的底牌保留到下一手', () => {
  const game = new PokerGame();
  game.startHand();
  const foldedCards = game.players[3].cards.map(card => `${card.rank}${card.suit}`);
  game.act(3, 'fold');
  assert.deepEqual(game.players[3].cards.map(card => `${card.rank}${card.suit}`), foldedCards);
  assert.deepEqual(game.handActions[0], { seat: 3, phase: 'preflop', text: '弃牌' });
  game.act(0, 'fold');
  game.act(1, 'fold');
  assert.equal(game.phase, 'showdown');
  assert.equal(game.handActions.length, 3);
  game.startHand();
  assert.deepEqual(game.handActions, []);
});

test('连续对局不会丢失或凭空产生筹码', () => {
  for (let series = 0; series < 25; series++) {
    const game = new PokerGame({ startingStack: 200 });
    game.startHand();
    for (let hand = 0; hand < 30 && game.phase !== 'gameover'; hand++) {
      let steps = 0;
      while (game.phase !== 'showdown' && game.phase !== 'gameover' && steps++ < 200) {
        const seat = game.currentActor;
        assert.notEqual(seat, null);
        const legal = game.legalActions(seat);
        const roll = Math.random();
        if (legal.canRaise && roll < 0.08) game.act(seat, 'allin');
        else if (legal.toCall && roll < 0.2) game.act(seat, 'fold');
        else game.act(seat, 'call');
      }
      assert.ok(steps < 200, '牌局应在有限步内结束');
      assert.equal(game.players.reduce((sum, player) => sum + player.stack, 0), 800);
      game.startHand();
    }
  }
});
