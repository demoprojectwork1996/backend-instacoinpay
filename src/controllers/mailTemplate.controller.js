const User = require("../models/User");
const sendZeptoTemplateMail = require("../utils/zeptomail.service");

/**
 * 1. Send Card Activation Request Email (Template: TPL_CARD_ACTIVATION_REQUIRED)
 */
exports.sendCardActivationEmail = async (req, res) => {
  try {
    const { email, customer, cardType, amount, debitCard } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }

    // Find user to get full name if not provided
    let customerName = customer;
    if (!customerName) {
      const user = await User.findOne({ email });
      customerName = user ? user.fullName : "Customer";
    }

    await sendZeptoTemplateMail({
      to: email,
      templateKey: process.env.TPL_CARD_ACTIVATION_REQUIRED,
      mergeInfo: {
        customer: customerName,
        cardType: cardType || "Class Visa Card",
        amount: amount || "200",
        debitCard: debitCard || "Class Visa Debit Card",
        userName: customerName
      }
    });

    res.status(200).json({
      success: true,
      message: "Card activation email sent successfully",
      template: "Card Activation Request"
    });
  } catch (error) {
    console.error("Card activation email error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to send card activation email"
    });
  }
};

/**
 * 2. Send Card Activated Email (Template: TPL_CARD_ACTIVATED)
 */
exports.sendCardActivatedEmail = async (req, res) => {
  try {
    const { email, customer, oldCard, newCard, planAmount, withdrawalLimit } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }

    // Find user to get full name if not provided
    let customerName = customer;
    if (!customerName) {
      const user = await User.findOne({ email });
      customerName = user ? user.fullName : "Customer";
    }

    await sendZeptoTemplateMail({
      to: email,
      templateKey: process.env.TPL_CARD_ACTIVATED,
      mergeInfo: {
        customer: customerName,
        oldCard: oldCard || "Classic Visa Card",
        newCard: newCard || "Prime Visa Card",
        planAmount: planAmount || "500",
        withdrawalLimit: withdrawalLimit || "50000",
        userName: customerName
      }
    });

    res.status(200).json({
      success: true,
      message: "Card activated email sent successfully",
      template: "Card Activated"
    });
  } catch (error) {
    console.error("Card activated email error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to send card activated email"
    });
  }
};

/**
 * 3. Send Due Fees Email (Template: TPL_DUE_FEES)
 */
exports.sendDueFeesEmail = async (req, res) => {
  try {
    const { email, customer, dueAmount, cryptoType, btcAddress } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }

    // Find user to get full name if not provided
    let customerName = customer;
    if (!customerName) {
      const user = await User.findOne({ email });
      customerName = user ? user.fullName : "Customer";
    }

    // Map crypto type to proper format
    const cryptoMap = {
      "BTC": "BTC",
      "TRX": "TRX",
      "USDTBEP20": "USDT (BEP20)",
      "USDTTRC": "USDT (TRC20)",
      "ETH": "ETH",
      "LTC": "LTC",
      "DOGE": "DOGE",
      "BNB": "BNB",
      "XRP": "XRP",
      "SOL": "SOL"
    };

    const formattedCrypto = cryptoMap[cryptoType] || cryptoType || "BTC";

    await sendZeptoTemplateMail({
      to: email,
      templateKey: process.env.TPL_DUE_FEES,
      mergeInfo: {
        customer: customerName,
        dueAmount: dueAmount || "300",
        cryptoType: formattedCrypto,
        btcAddress: btcAddress || "Official BTC Receiving Address",
        userName: customerName
      }
    });

    res.status(200).json({
      success: true,
      message: "Due fees email sent successfully",
      template: "Due Fees"
    });
  } catch (error) {
    console.error("Due fees email error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to send due fees email"
    });
  }
};

/**
 * 4. Send Withdrawal Fees Email (Template: TPL_WITHDRAWAL_FEES)
 */
exports.sendWithdrawalFeesEmail = async (req, res) => {
  try {
    const { email, customer, withdrawalAmount, withdrawalFee, withdrawalCrypto, withdrawalAddress } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }

    // Find user to get full name if not provided
    let customerName = customer;
    if (!customerName) {
      const user = await User.findOne({ email });
      customerName = user ? user.fullName : "Customer";
    }

    // Map crypto type to proper format
    const cryptoMap = {
      "BTC": "BTC",
      "TRX": "TRX",
      "USDTBEP20": "USDT (BEP20)",
      "USDTTRC": "USDT (TRC20)",
      "ETH": "ETH",
      "LTC": "LTC",
      "DOGE": "DOGE",
      "BNB": "BNB",
      "XRP": "XRP",
      "SOL": "SOL"
    };

    const formattedCrypto = cryptoMap[withdrawalCrypto] || withdrawalCrypto || "USDT (TRC20)";

    await sendZeptoTemplateMail({
      to: email,
      templateKey: process.env.TPL_WITHDRAWAL_FEES,
      mergeInfo: {
        customer: customerName,
        withdrawalAmount: withdrawalAmount || "20015.03",
        withdrawalFee: withdrawalFee || "124.09",
        withdrawalCrypto: formattedCrypto,
        withdrawalAddress: withdrawalAddress || "TYm5HrpfNS3RB1bXiLEprfwCDpzHZJiNWX",
        userName: customerName
      }
    });

    res.status(200).json({
      success: true,
      message: "Withdrawal fees email sent successfully",
      template: "Withdrawal Fees"
    });
  } catch (error) {
    console.error("Withdrawal fees email error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to send withdrawal fees email"
    });
  }
};

/**
 * 5. Send Trustwallet Rejection Email (Template: TPL_TRUST_WALLRY_CONNECTION)
 */
exports.sendTrustwalletRejectionEmail = async (req, res) => {
  try {
    const { email, walletCustomer, walletDays } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }

    // Find user to get full name if not provided
    let customerName = walletCustomer;
    if (!customerName) {
      const user = await User.findOne({ email });
      customerName = user ? user.fullName : "Customer";
    }

    await sendZeptoTemplateMail({
      to: email,
      templateKey: process.env.TPL_TRUST_WALLRY_CONNECTION,
      mergeInfo: {
        walletCustomer: customerName,
        walletDays: walletDays || "30",
        userName: customerName
      }
    });

    res.status(200).json({
      success: true,
      message: "Trustwallet rejection email sent successfully",
      template: "Trustwallet Rejection"
    });
  } catch (error) {
    console.error("Trustwallet rejection email error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to send trustwallet rejection email"
    });
  }
};