const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { User } = require('./auth');

const gameHistorySchema = new mongoose.Schema({
  userId: String, uid: String, game: String,
  betAmount: Number, result: Number, win: Boolean, payout: Number,
  timestamp: { type: Date, default: Date.now }
});
const GameHistory = mongoose.model('GameHistory', gameHistorySchema);

function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ msg: 'Unauthorized' });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ msg: 'Invalid token' }); }
}

// AVIATOR
router.get('/aviator/round', (req, res) => {
  const r = Math.random();
  let crashAt;
  if (r < 0.01) crashAt = 1.00;
  else if (r < 0.30) crashAt = parseFloat((1 + Math.random() * 1.5).toFixed(2));
  else if (r < 0.65) crashAt = parseFloat((2 + Math.random() * 3).toFixed(2));
  else if (r < 0.90) crashAt = parseFloat((5 + Math.random() * 10).toFixed(2));
  else crashAt = parseFloat((15 + Math.random() * 85).toFixed(2));
  res.json({ crashAt });
});

router.post('/aviator/bet', authMiddleware, async (req, res) => {
  try {
    const { betAmount, cashoutAt } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < betAmount) return res.status(400).json({ msg: 'Insufficient balance' });
    const r = Math.random();
    let crashAt;
    if (r < 0.35) crashAt = parseFloat((1 + Math.random() * 1.8).toFixed(2));
    else if (r < 0.70) crashAt = parseFloat((2 + Math.random() * 4).toFixed(2));
    else crashAt = parseFloat((6 + Math.random() * 50).toFixed(2));
    const won = cashoutAt <= crashAt;
    const payout = won ? parseFloat((betAmount * cashoutAt).toFixed(2)) : 0;
    user.balance = parseFloat((user.balance - betAmount + payout).toFixed(2));
    await user.save();
    await GameHistory.create({ userId: user._id.toString(), uid: user.uid, game: 'aviator', betAmount, result: crashAt, win: won, payout });
    res.json({ won, crashAt, payout, newBalance: user.balance });
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

// MINES
router.post('/mines/bet', authMiddleware, async (req, res) => {
  try {
    const { betAmount, mineCount, selectedTiles } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < betAmount) return res.status(400).json({ msg: 'Insufficient balance' });
    const minePositions = [];
    while (minePositions.length < mineCount) {
      const pos = Math.floor(Math.random() * 25);
      if (!minePositions.includes(pos)) minePositions.push(pos);
    }
    const hitMine = selectedTiles.some(t => minePositions.includes(t));
    let payout = 0;
    if (!hitMine) {
      const safe = 25 - mineCount;
      let m = 1;
      for (let i = 0; i < selectedTiles.length; i++) m *= (safe - i) / (25 - mineCount - i);
      payout = parseFloat((betAmount * (1 / m * 0.97)).toFixed(2));
    }
    user.balance = parseFloat((user.balance - betAmount + payout).toFixed(2));
    await user.save();
    await GameHistory.create({ userId: user._id.toString(), uid: user.uid, game: 'mines', betAmount, result: mineCount, win: !hitMine, payout });
    res.json({ hitMine, minePositions, payout, newBalance: user.balance });
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

// WINGO
router.post('/wingo/bet', authMiddleware, async (req, res) => {
  try {
    const { betAmount, betOn } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < betAmount) return res.status(400).json({ msg: 'Insufficient balance' });
    const result = Math.floor(Math.random() * 10);
    const colorMap = { 0:'red',1:'green',2:'red',3:'green',4:'red',5:'violet',6:'red',7:'green',8:'red',9:'green' };
    const resultColor = colorMap[result];
    let won = false, multiplier = 1;
    if (betOn === resultColor) { won = true; multiplier = betOn === 'violet' ? 4.5 : 1.95; }
    else if (betOn === result.toString()) { won = true; multiplier = 9; }
    const payout = won ? parseFloat((betAmount * multiplier).toFixed(2)) : 0;
    user.balance = parseFloat((user.balance - betAmount + payout).toFixed(2));
    await user.save();
    await GameHistory.create({ userId: user._id.toString(), uid: user.uid, game: 'wingo', betAmount, result, win: won, payout });
    res.json({ result, resultColor, won, payout, multiplier, newBalance: user.balance });
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.get('/history', authMiddleware, async (req, res) => {
  try {
    const history = await GameHistory.find({ userId: req.user.id }).sort({ timestamp: -1 }).limit(50);
    res.json(history);
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

// Admin: all game history
router.get('/admin/history', async (req, res) => {
  try {
    const { adminKey } = req.query;
    if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ msg: 'Forbidden' });
    const history = await GameHistory.find().sort({ timestamp: -1 }).limit(200);
    const stats = {
      totalBets: history.length,
      totalWagered: history.reduce((s, h) => s + h.betAmount, 0).toFixed(2),
      totalPayout: history.reduce((s, h) => s + h.payout, 0).toFixed(2),
      houseProfit: (history.reduce((s, h) => s + h.betAmount - h.payout, 0)).toFixed(2)
    };
    res.json({ stats, history });
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

module.exports = router;
