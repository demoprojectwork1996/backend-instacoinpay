const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Trade = require('../models/Trade');
const cryptoDataService = require('../services/cryptoDataService');

// TradingPanel symbol keys → User.walletBalances keys
const SYMBOL_MAP = {
  BTC:        'btc',
  ETH:        'eth',
  BNB:        'bnb',
  SOL:        'sol',
  XRP:        'xrp',
  DOGE:       'doge',
  LTC:        'ltc',
  TRX:        'trx',
  USDT_TRC20: 'usdtTron',
  USDT_BEP20: 'usdtBnb'
};

// USDT balance key mapping
const USDT_MAP = {
  'USDT_TRC20': 'usdtTron',
  'USDT_BEP20': 'usdtBnb'
};

// GET /api/trades
router.get('/', protect, async (req, res) => {
  try {
    const trades = await Trade.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ success: true, data: trades });
  } catch (err) {
    console.error('[GET /api/trades]', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/trades
router.post('/', protect, async (req, res) => {
  try {
    const { type, symbol, amount, usdAmount, price } = req.body;

    // Validate input
    if (!type || !symbol || !amount) {
      return res.status(400).json({ 
        success: false, 
        message: 'type, symbol and amount are required' 
      });
    }
    
    if (!['buy', 'sell'].includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'type must be buy or sell' 
      });
    }
    
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'amount must be a positive number' 
      });
    }

    const walletKey = SYMBOL_MAP[symbol];
    if (!walletKey) {
      return res.status(400).json({ 
        success: false, 
        message: `Unknown symbol: ${symbol}` 
      });
    }

    // Get current price (use provided price or fetch live)
    let currentPrice = price;
    if (!currentPrice) {
      const prices = await cryptoDataService.getAllCoinPrices();
      const priceData = prices?.[walletKey];
      if (!priceData?.currentPrice) {
        return res.status(502).json({ 
          success: false, 
          message: 'Could not fetch current price. Try again.' 
        });
      }
      currentPrice = priceData.currentPrice;
    }

    const total = parsedAmount * currentPrice;
    const fee = 0; // Trading fees set to ZERO

    // Load user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Determine USDT balance key (for stablecoin trades)
    // If trading USDT, we need to handle differently
    const isStablecoin = symbol === 'USDT_TRC20' || symbol === 'USDT_BEP20';
    
    let currentUsdtBalance;
    if (isStablecoin) {
      // Trading USDT itself - use the specific USDT balance
      const usdtKey = USDT_MAP[symbol];
      currentUsdtBalance = user.walletBalances?.[usdtKey] || 0;
    } else {
      // Trading crypto with USDT - use the first USDT balance (prefer USDT_BEP20)
      currentUsdtBalance = user.walletBalances?.usdtBnb || user.walletBalances?.usdtTron || 0;
    }

    const currentHolding = user.walletBalances?.[walletKey] || 0;

    // Validate & update balances
    if (type === 'buy') {
      // Check if user has enough USDT
      if (total > currentUsdtBalance) {
        return res.status(400).json({
          success: false,
          message: `Insufficient USDT balance. You have $${currentUsdtBalance.toFixed(2)}`
        });
      }

      // Deduct USDT
      if (isStablecoin) {
        // If buying USDT, we're trading one USDT type for another
        const usdtKey = USDT_MAP[symbol];
        user.walletBalances[usdtKey] = currentUsdtBalance + parsedAmount;
      } else {
        // Deduct from the appropriate USDT balance
        if (user.walletBalances?.usdtBnb >= total) {
          user.walletBalances.usdtBnb = (user.walletBalances.usdtBnb || 0) - total;
        } else if (user.walletBalances?.usdtTron >= total) {
          user.walletBalances.usdtTron = (user.walletBalances.usdtTron || 0) - total;
        } else {
          // Use combination? For simplicity, just use usdtBnb
          user.walletBalances.usdtBnb = (user.walletBalances.usdtBnb || 0) - total;
        }
        
        // Add crypto
        user.walletBalances[walletKey] = currentHolding + parsedAmount;
      }
    } else {
      // SELL
      if (parsedAmount > currentHolding) {
        return res.status(400).json({
          success: false,
          message: `Insufficient ${symbol}. You have ${currentHolding.toFixed(8)} ${symbol}`
        });
      }

      // Remove crypto
      user.walletBalances[walletKey] = currentHolding - parsedAmount;
      
      // Add USDT
      if (isStablecoin) {
        // If selling USDT, add to the specific USDT balance
        const usdtKey = USDT_MAP[symbol];
        user.walletBalances[usdtKey] = (user.walletBalances[usdtKey] || 0) + total;
      } else {
        // Add to USDT balance (prefer usdtBnb)
        user.walletBalances.usdtBnb = (user.walletBalances.usdtBnb || 0) + total;
      }
      
      // Clean up if zero
      if (user.walletBalances[walletKey] <= 0.00000001) {
        delete user.walletBalances[walletKey];
      }
    }

    // Mark modified and save
    user.markModified('walletBalances');
    await user.save();

    // Record trade with zero fee
    const trade = await Trade.create({
      user: req.user.id,
      type,
      symbol: walletKey,
      amount: parsedAmount,
      price: currentPrice,
      total,
      fee  // fee is now 0
    });

    // Return the updated balances
    const updatedUsdtBalance = user.walletBalances?.usdtBnb || user.walletBalances?.usdtTron || 0;
    const updatedHolding = user.walletBalances?.[walletKey] || 0;

    res.json({
      success: true,
      trade,
      newBalance: updatedUsdtBalance,
      newHolding: updatedHolding,
      portfolio: user.walletBalances
    });

  } catch (err) {
    console.error('[POST /api/trades]', err);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Server error' 
    });
  }
});

module.exports = router;