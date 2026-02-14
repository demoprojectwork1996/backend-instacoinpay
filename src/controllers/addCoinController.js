const User = require("../models/User");
const Transfer = require("../models/Transfer");
const sendTransactionMail = require("../utils/sendZeptoTemplateMail");
const { generateRandomAddress } = require("../utils/cryptoAddress");
const cryptoDataService = require("../services/cryptoDataService");

exports.updateWalletBalance = async (req, res) => {
  try {
    const { email, asset, amount } = req.body;

    console.log("🔧 updateWalletBalance called with:", {
      email,
      asset,
      amount: Number(amount),
      timestamp: new Date().toISOString()
    });

    if (!email || !asset || amount === undefined) {
      return res.status(400).json({
        success: false,
        error: "Email, asset and amount are required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      console.log("❌ User not found:", email);
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    if (!user.walletBalances || !user.walletBalances.hasOwnProperty(asset)) {
      return res.status(400).json({
        success: false,
        error: "Invalid asset",
      });
    }

    const oldBalance = user.walletBalances[asset] || 0;
    const newBalance = Number(amount);

    if (isNaN(newBalance)) {
      return res.status(400).json({
        success: false,
        error: "Invalid amount",
      });
    }

    const difference = newBalance - oldBalance;

    // If no change, skip everything
    if (difference === 0) {
      return res.status(200).json({
        success: true,
        message: "No balance change",
        walletBalances: user.walletBalances,
      });
    }

    const actionType = difference > 0 ? "credited" : "debited";
    const actionAmount = Math.abs(difference);
    
    // ✅ FIX: Determine transaction type based on credit/debit
    const transactionType = difference > 0 ? "Receive" : "Send";

    console.log("📊 Transaction details:", {
      oldBalance,
      newBalance,
      difference,
      actionType,
      actionAmount,
      transactionType // Added for clarity
    });

    // Update balance
    user.walletBalances[asset] = newBalance;
    await user.save();

    console.log("✅ Balance updated in database");

    // =========================
    // CREATE TRANSFER RECORD
    // =========================
    try {
      const prices = await cryptoDataService.getAllCoinPrices();
      const currentPrice = prices?.[asset]?.currentPrice || 0;
      const usdValue = actionAmount * currentPrice;

      // Always use user's real wallet address
      const userWalletAddress =
        user.walletAddresses?.[asset] ||
        generateRandomAddress(asset.toUpperCase());

      let fromAddress;
      let toAddress;

      if (actionType === "credited") {
        // Credit → funds coming INTO user
        fromAddress = generateRandomAddress(asset.toUpperCase()); // simulate external source
        toAddress = userWalletAddress;
      } else {
        // Debit → funds going OUT of user
        fromAddress = userWalletAddress;
        toAddress = generateRandomAddress(asset.toUpperCase());
      }

      // ✅ FIX: Add type field and format amount with sign
      await Transfer.create({
        fromUser: user._id,
        toUser: user._id,
        fromAddress,
        toAddress,
        asset,
        amount: actionAmount,
        value: usdValue,
        currentPrice,
        status: "completed",
        type: transactionType, // ✅ ADD THIS: "Receive" for credit, "Send" for debit
        notes: `Admin ${actionType} balance`,
        createdAt: new Date(),
        completedAt: new Date(),
      });

      console.log("✅ Transfer record created with type:", transactionType);
    } catch (transferError) {
      console.error("❌ Failed to create transfer record:", transferError);
    }

    // =========================
    // EMAIL NOTIFICATION
    // =========================
    try {
      sendBalanceUpdateEmail(
        user,
        asset,
        actionType,
        actionAmount,
        newBalance
      );
    } catch (emailError) {
      console.error("❌ Email sending failed:", emailError);
    }

    return res.status(200).json({
      success: true,
      message: "Wallet balance updated",
      walletBalances: user.walletBalances,
    });

  } catch (error) {
    console.error("❌ Update wallet balance error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};


// Helper function to send balance update email
const sendBalanceUpdateEmail = async (user, asset, actionType, amount, newBalance) => {
  try {
    console.log("🚀 sendBalanceUpdateEmail called with:", {
      userEmail: user.email,
      asset,
      actionType,
      amount,
      newBalance
    });

    // Map asset keys to display names
    const cryptoDisplayNames = {
      btc: "Bitcoin (BTC)",
      eth: "Ethereum (ETH)",
      usdtTron: "USDT (TRON)",
      usdtBnb: "USDT (BNB)",
      bnb: "Binance Coin (BNB)",
      trx: "TRON (TRX)",
      sol: "Solana (SOL)",
      xrp: "Ripple (XRP)",
      doge: "Dogecoin (DOGE)",
      ltc: "Litecoin (LTC)"
    };

    // Choose template based on action type
    let templateKey;
    if (actionType === "credited") {
      templateKey = process.env.TPL_ADMIN_BALANCE_UPDATE;
    } else if (actionType === "debited") {
      templateKey = process.env.TPL_ADMIN_BALANCE_DEBIT;
    }
    
    console.log("📋 Email configuration:", {
      actionType,
      templateKey: templateKey ? `${templateKey.substring(0, 20)}...` : 'MISSING',
      hasZeptoAPIKey: !!process.env.ZEPTOMAIL_API_KEY,
      hasZeptoFrom: !!process.env.ZEPTOMAIL_FROM
    });

    if (!templateKey) {
      console.error(`❌ Template key for ${actionType} is not set in environment variables`);
      console.log("Current env variables starting with TPL_:");
      Object.keys(process.env).forEach(key => {
        if (key.startsWith('TPL_')) {
          console.log(`  ${key}=${process.env[key]?.substring(0, 30)}...`);
        }
      });
      return null;
    }

    const emailVariables = {
      userName: user.name || user.username || user.email.split('@')[0] || "Valued Customer",
      action: actionType,
      cryptoName: cryptoDisplayNames[asset] || asset.toUpperCase(),
      amount: amount.toFixed(8),
      newBalance: newBalance.toFixed(8),
      date: new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      adminEmail: "admin@instacoinxpay.com",
      transactionId: `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`,
      transactionType: actionType === "credited" ? "Deposit" : "Withdrawal",
      symbol: actionType === "credited" ? "+" : "-"
    };

    console.log("📨 Sending email with sendTransactionMail:", {
      to: user.email,
      actionType,
      template: templateKey,
      variablesCount: Object.keys(emailVariables).length
    });

    const result = await sendTransactionMail({
      to: user.email,
      template: templateKey,
      variables: emailVariables
    });
    
    if (result) {
      console.log(`✅ ${actionType} balance update email sent successfully to ${user.email}`);
      console.log("📩 Email result:", {
        messageId: result.data?.[0]?.message_id || 'Unknown',
        status: 'Sent',
        actionType
      });
    } else {
      console.warn(`⚠️ Failed to send ${actionType} balance update email to ${user.email}`);
    }
    
    return result;
    
  } catch (error) {
    console.error(`❌ Error in sendBalanceUpdateEmail for ${user.email}:`, error);
    console.error("Error details:", error.message);
    return null;
  }
};

exports.getUserWalletBalances = async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    const user = await User.findOne({ email }).select("walletBalances");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      walletBalances: user.walletBalances,
    });
  } catch (error) {
    console.error("Fetch wallet error:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};

// Test endpoint
exports.testAdminEmail = async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log("🧪 Testing admin balance update email...");
    
    const result = await sendTransactionMail({
      to: email || "shantanupatil.it2003@gmail.com",
      template: process.env.TPL_ADMIN_BALANCE_UPDATE,
      variables: {
        userName: "Test User",
        action: "credited",
        cryptoName: "TRON (TRX)",
        amount: "10.00000000",
        newBalance: "10.00000000",
        date: new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        adminEmail: "admin@instacoinxpay.com",
        transactionId: `TXN${Date.now()}`
      }
    });
    
    res.json({
      success: !!result,
      message: result ? "Test email sent successfully" : "Failed to send email",
      result
    });
    
  } catch (error) {
    console.error("Test email error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};