const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");

const VALID_ASSETS = [
  "btc", "bnb", "usdtTron", "usdtBnb",
  "trx", "eth", "sol", "xrp", "doge", "ltc"
];

// POST /api/swap/execute
router.post("/execute", protect, async (req, res) => {
  try {
    // Lazy load to avoid circular dependency
    const User = require("../models/User");
    const cryptoDataService = require("../services/cryptoDataService");

    const { fromAsset, toAsset, usdValue } = req.body;

    if (!fromAsset || !toAsset || !usdValue)
      return res.status(400).json({ success: false, message: "Missing required fields" });

    if (!VALID_ASSETS.includes(fromAsset) || !VALID_ASSETS.includes(toAsset))
      return res.status(400).json({ success: false, message: "Invalid asset" });

    if (fromAsset === toAsset)
      return res.status(400).json({ success: false, message: "Cannot swap same asset" });

    const usd = parseFloat(usdValue);
    if (isNaN(usd) || usd <= 0)
      return res.status(400).json({ success: false, message: "Invalid amount" });

    const user = await User.findById(req.user.id);
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    const prices = await cryptoDataService.getAllCoinPrices();
    const fromPrice = prices?.[fromAsset]?.currentPrice;
    const toPrice   = prices?.[toAsset]?.currentPrice;

    if (!fromPrice || !toPrice)
      return res.status(400).json({ success: false, message: "Price data unavailable" });

    const fromCoinAmount = usd / fromPrice;
    const toCoinAmount   = usd / toPrice;

    const currentFromBalance = user.walletBalances[fromAsset] || 0;
    if (currentFromBalance < fromCoinAmount)
      return res.status(400).json({ success: false, message: "Insufficient balance" });

    user.walletBalances[fromAsset] = currentFromBalance - fromCoinAmount;
    user.walletBalances[toAsset]   = (user.walletBalances[toAsset] || 0) + toCoinAmount;
    user.markModified("walletBalances");
    await user.save();

    res.json({
      success: true,
      message: "Swap successful",
      data: {
        fromAsset,
        toAsset,
        fromCoinAmount,
        toCoinAmount,
        usdValue: usd,
        newFromBalance: user.walletBalances[fromAsset],
        newToBalance:   user.walletBalances[toAsset],
      },
    });
  } catch (err) {
    console.error("[swap/execute]", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;