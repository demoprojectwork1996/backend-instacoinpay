const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth'); // your existing auth middleware
const User = require('../models/User');
const cryptoDataService = require('../services/cryptoDataService');

// GET /api/wallet/balances
router.get('/balances', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const prices = await cryptoDataService.getAllCoinPrices();

    const balances = Object.keys(user.walletBalances).map((coinKey) => {
      const balance = user.walletBalances[coinKey] || 0;
      const priceData = prices?.[coinKey] || {};
      const currentPrice = priceData.currentPrice || 0;

      return {
        coin: coinKey,                                    // e.g. "usdtTron", "btc"
        balance: balance,                                 // coin amount
        balanceValue: balance * currentPrice,             // USD value
        currentPrice: currentPrice,
        priceChangePercentage24h: priceData.priceChangePercentage24h || 0,
      };
    });

    res.json({ success: true, data: balances });
  } catch (err) {
    console.error('[wallet/balances]', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;