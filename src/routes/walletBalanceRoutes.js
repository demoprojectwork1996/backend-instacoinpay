const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");

// All supported coin keys matching User.walletBalances schema
const ALL_COINS = [
  "btc", "eth", "usdtTron", "usdtBnb", "bnb", "sol", "doge", "xrp", "trx", "ltc"
];

router.get("/balances", protect, async (req, res) => {
  try {
    const User = require("../models/User");
    const cryptoDataService = require("../services/cryptoDataService");

    const user = await User.findById(req.user.id);
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    const prices = await cryptoDataService.getAllCoinPrices();

    // Always return ALL coins, not just ones with balance
    const balances = ALL_COINS.map((coinKey) => {
      const balance = user.walletBalances?.[coinKey] || 0;
      const priceData = prices?.[coinKey] || {};
      const currentPrice = priceData.currentPrice || 0;

      return {
        coin: coinKey,
        balance: balance,
        balanceValue: balance * currentPrice,
        currentPrice: currentPrice,
        priceChangePercentage24h: priceData.priceChangePercentage24h || 0,
      };
    });

    res.json({ success: true, data: balances });
  } catch (err) {
    console.error("[wallet/balances]", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;