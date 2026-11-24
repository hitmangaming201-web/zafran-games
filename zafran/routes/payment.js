const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { User } = require('./auth');

const txSchema = new mongoose.Schema({
  userId: String, uid: String,
  type: { type: String, enum: ['deposit', 'withdraw'] },
  amount: Number,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  utr: String, txId: String, upiId: String, method: String, bankCard: String,
  withdrawPassword: String,
  timestamp: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', txSchema);

function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ msg: 'Unauthorized' });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ msg: 'Invalid token' }); }
}

router.post('/deposit/initiate', authMiddleware, async (req, res) => {
  try {
    const { amount, method } = req.body;
    const user = await User.findById(req.user.id);
    const txId = uuidv4().replace(/-/g, '').substring(0, 12).toUpperCase();
    const upiString = `upi://pay?pa=${process.env.UPI_ID}&pn=${encodeURIComponent(process.env.UPI_NAME)}&am=${amount}&cu=INR&tn=ZAFRAN${txId}`;
    const qrDataUrl = await QRCode.toDataURL(upiString);
    await Transaction.create({ userId: req.user.id, uid: user.uid, type: 'deposit', amount, method, txId, status: 'pending' });
    res.json({ qrDataUrl, upiString, txId, upiId: process.env.UPI_ID });
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.post('/deposit/utr', authMiddleware, async (req, res) => {
  try {
    const { txId, utr } = req.body;
    const tx = await Transaction.findOne({ txId, userId: req.user.id });
    if (!tx) return res.status(404).json({ msg: 'Transaction not found' });
    tx.utr = utr;
    await tx.save();
    res.json({ msg: 'UTR submitted successfully', txId });
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.post('/admin/approve', async (req, res) => {
  try {
    const { txId, adminKey } = req.body;
    if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ msg: 'Forbidden' });
    const tx = await Transaction.findOne({ txId });
    if (!tx || tx.status !== 'pending') return res.status(400).json({ msg: 'Invalid or already processed' });
    tx.status = 'approved';
    await tx.save();
    const user = await User.findById(tx.userId);
    if (user && tx.type === 'deposit') {
      user.balance += tx.amount;
      user.totalDeposited = (user.totalDeposited || 0) + tx.amount;
      await user.save();
    }
    res.json({ msg: 'Approved', amount: tx.amount });
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.post('/admin/reject', async (req, res) => {
  try {
    const { txId, adminKey } = req.body;
    if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ msg: 'Forbidden' });
    const tx = await Transaction.findOne({ txId });
    if (!tx) return res.status(404).json({ msg: 'Not found' });
    tx.status = 'rejected';
    await tx.save();
    res.json({ msg: 'Rejected' });
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.get('/admin/transactions', async (req, res) => {
  try {
    const { adminKey } = req.query;
    if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ msg: 'Forbidden' });
    const txns = await Transaction.find().sort({ timestamp: -1 }).limit(200);
    const pending = txns.filter(t => t.status === 'pending');
    const totalDeposited = txns.filter(t => t.status === 'approved' && t.type === 'deposit').reduce((s, t) => s + t.amount, 0);
    res.json({ pending, all: txns, stats: { totalDeposited: totalDeposited.toFixed(2), pendingCount: pending.length } });
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

// Withdrawal: requires password + must have deposited >= 100
router.post('/withdraw', authMiddleware, async (req, res) => {
  try {
    const { amount, upiId, method, bankCard, password } = req.body;
    const bcrypt = require('bcryptjs');
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });
    // Verify password
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ msg: 'Incorrect password' });
    // Must have deposited >= 100
    if ((user.totalDeposited || 0) < 100) return res.status(400).json({ msg: 'You must deposit at least ₹100 before withdrawing' });
    if (amount < 100) return res.status(400).json({ msg: 'Minimum withdrawal is ₹100' });
    if (user.balance < amount) return res.status(400).json({ msg: 'Insufficient balance' });
    user.balance -= amount;
    await user.save();
    const txId = uuidv4().replace(/-/g, '').substring(0, 12).toUpperCase();
    await Transaction.create({ userId: req.user.id, uid: user.uid, type: 'withdraw', amount, upiId, bankCard, method: method || 'upi', txId, status: 'pending' });
    res.json({ msg: 'Withdrawal request submitted', txId });
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

router.get('/history', authMiddleware, async (req, res) => {
  try {
    const history = await Transaction.find({ userId: req.user.id }).sort({ timestamp: -1 });
    res.json(history);
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

module.exports = router;
