'use strict';
const { UserError } = require('./auth');

/**
 * Quién le paga a quién: empareja a los que perdieron con los que ganaron
 * (el que más debe le paga primero al que más ganó), con la menor cantidad de pagos posible en la práctica.
 */
function settle(players) {
  const winners = players.filter((p) => p.balance > 0).map((p) => ({ name: p.username, code: p.code, left: p.balance }))
    .sort((a, b) => b.left - a.left);
  const losers = players.filter((p) => p.balance < 0).map((p) => ({ name: p.username, code: p.code, left: -p.balance }))
    .sort((a, b) => b.left - a.left);
  const payments = [];
  let i = 0; let j = 0;
  while (i < losers.length && j < winners.length) {
    const amount = Math.min(losers[i].left, winners[j].left);
    if (amount > 0) payments.push({ from: losers[i].name, fromCode: losers[i].code, to: winners[j].name, toCode: winners[j].code, amount });
    losers[i].left -= amount; winners[j].left -= amount;
    if (losers[i].left === 0) i++;
    if (winners[j].left === 0) j++;
  }
  return payments;
}

/** Filas de jugadores con cargas y saldo de una sesión (sin chequeo de permisos). */
function sessionPlayers(db, sessionId, ended) {
  const players = db.prepare(`SELECT sp.user_id, sp.stack, sp.seated, sp.first_joined_at, u.username, u.code
    FROM session_players sp JOIN users u ON u.id = sp.user_id WHERE sp.session_id = ? ORDER BY sp.first_joined_at`).all(sessionId);
  const ledger = db.prepare('SELECT * FROM chip_ledger WHERE session_id = ? ORDER BY id').all(sessionId);
  return players.map((p) => {
    const mine = ledger.filter((l) => l.user_id === p.user_id);
    const initial = mine.find((l) => l.kind === 'buyin');
    const loads = mine.filter((l) => l.kind === 'rebuy' || l.kind === 'reentry')
      .map((l) => ({ amount: l.amount, at: l.created_at, kind: l.kind }));
    const totalLoaded = mine.filter((l) => l.kind !== 'cashout').reduce((a, l) => a + l.amount, 0);
    const withdrawn = mine.filter((l) => l.kind === 'cashout').reduce((a, l) => a + l.amount, 0);
    const remaining = p.stack;
    return {
      username: p.username, code: p.code, seated: !!p.seated && !ended,
      initial: initial ? initial.amount : 0, initialAt: initial ? initial.created_at : null,
      reloads: loads, reloadCount: loads.length, totalLoaded, withdrawn, remaining,
      finalAmount: withdrawn + remaining,
      balance: withdrawn + remaining - totalLoaded,
    };
  });
}

function sessionAccounts(db, sessionId) {
  const s = db.prepare(`SELECT s.*, t.name AS table_name, t.code AS table_code, t.small_blind, t.big_blind
    FROM table_sessions s JOIN poker_tables t ON t.id = s.table_id WHERE s.id = ?`).get(sessionId);
  if (!s) return null;
  const players = sessionPlayers(db, s.id, !!s.ended_at);
  const hands = db.prepare('SELECT COUNT(*) AS n FROM hands WHERE session_id = ? AND ended_at IS NOT NULL').get(s.id).n;
  return {
    sessionId: s.id, tableName: s.table_name, tableCode: s.table_code, smallBlind: s.small_blind, bigBlind: s.big_blind,
    startedAt: s.started_at, endedAt: s.ended_at, hands, players, payments: settle(players), savedAt: new Date().toISOString(),
  };
}

function createHistory(db) {
  function listSessions(userId) {
    return db.prepare(`
      SELECT s.id, s.started_at AS startedAt, s.ended_at AS endedAt, t.name AS tableName, t.code AS tableCode,
        (SELECT COUNT(*) FROM hands h WHERE h.session_id = s.id AND h.ended_at IS NOT NULL) AS hands,
        (SELECT COUNT(*) FROM session_players x WHERE x.session_id = s.id) AS players
      FROM table_sessions s
      JOIN poker_tables t ON t.id = s.table_id
      WHERE EXISTS (SELECT 1 FROM session_players sp WHERE sp.session_id = s.id AND sp.user_id = ?)
      ORDER BY s.started_at DESC LIMIT 200`).all(userId);
  }

  function sessionDetail(userId, sessionId) {
    const s = db.prepare(`SELECT s.*, t.name AS table_name, t.code AS table_code, t.small_blind, t.big_blind
      FROM table_sessions s JOIN poker_tables t ON t.id = s.table_id WHERE s.id = ?`).get(String(sessionId));
    const isParticipant = s && db.prepare('SELECT 1 FROM session_players WHERE session_id = ? AND user_id = ?').get(s.id, userId);
    if (!s || !isParticipant) throw new UserError('No encontramos esa sesión o no participaste en ella', 404);

    const rows = sessionPlayers(db, s.id, !!s.ended_at);

    const hands = db.prepare('SELECT hand_number, started_at, ended_at, summary FROM hands WHERE session_id = ? ORDER BY hand_number').all(s.id)
      .map((h) => {
        const sum = h.summary ? JSON.parse(h.summary) : null;
        return {
          number: h.hand_number, startedAt: h.started_at, endedAt: h.ended_at,
          voided: !!(sum && sum.voided),
          board: sum && sum.board ? sum.board : [],
          winners: sum && sum.winners ? sum.winners.map((w) => ({ username: w.username, amount: w.amount, handName: w.handName })) : [],
          showdown: sum && sum.showdown ? sum.showdown.map((x) => ({ username: x.username, cards: x.cards, handName: x.handName })) : [],
          shown: sum && sum.shown ? sum.shown.map((x) => ({ username: x.username, cards: x.cards })) : [],
        };
      });

    return {
      id: s.id, tableName: s.table_name, tableCode: s.table_code,
      startedAt: s.started_at, endedAt: s.ended_at, smallBlind: s.small_blind, bigBlind: s.big_blind,
      players: rows, payments: settle(rows), hands,
    };
  }

  return { listSessions, sessionDetail };
}

module.exports = { createHistory, sessionAccounts, settle };
