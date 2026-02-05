const crypto = require("crypto");
const sendTransactionMail = require("../utils/sendZeptoTemplateMail");
const User = require("../models/User");
const DebitCardApplication = require("../models/DebitCardApplication");

/**
 * =========================================
 * STEP 1: INITIATE PAYPAL WITHDRAWAL (OTP)
 * =========================================
 */
exports.initiatePaypalWithdrawal = async (req, res) => {
  try {
    const user = req.user;

    // generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.transferOTP = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    user.transferOTPExpires = Date.now() + 10 * 60 * 1000; // 10 mins
    user.pendingTransferData = req.body;

    await user.save();

    // send OTP mail
    await sendTransactionMail({
      to: user.email,
      template: process.env.TPL_PAYPAL_WITHDRAWAL_OTP,
      variables: {
        userName: user.fullName,
        otp,
        asset: req.body.asset.toUpperCase(),
        amount: req.body.amount,
        usdAmount: req.body.usdAmount,
        paypalEmail: req.body.paypalEmail,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        year: new Date().getFullYear(),
      },
    });

    return res.json({
      success: true,
      message: "OTP sent to your email",
    });
  } catch (err) {
    console.error("PayPal OTP Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
};

/**
 * =========================================
 * STEP 2: VERIFY PAYPAL OTP
 * =========================================
 */
exports.verifyPaypalWithdrawalOTP = async (req, res) => {
  try {
    const user = req.user;
    const { otp } = req.body;

    const hashedOtp = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    // OTP validation
    if (
      !user.transferOTP ||
      user.transferOTP !== hashedOtp ||
      user.transferOTPExpires < Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    // =====================
    // FETCH CARD STATUS
    // =====================
    const card = await DebitCardApplication.findOne({
      email: user.email,
    });

    const cardStatus = (card?.status || "INACTIVE").toUpperCase();

    const isAllowed = ["ACTIVE", "ACTIVATE", "PENDING"].includes(cardStatus);

    // =====================
    // FINAL TRANSFER STATUS
    // =====================
    const transferStatus = isAllowed ? "processing" : "failed";

    // =====================
    // TEMPLATE MAPPING (ONLY 2)
    // =====================
    const templateMap = {
      processing: process.env.TPL_PAYPAL_WITHDRAWAL_PENDING,
      failed: process.env.TPL_PAYPAL_WITHDRAWAL_FAILED,
    };

    const templateKey = templateMap[transferStatus];

    const transferData = user.pendingTransferData;
    const transactionId = `PAYPAL-${Date.now()}`;

    // =====================
    // CLEAR USER TEMP DATA
    // =====================
    user.transferOTP = null;
    user.transferOTPExpires = null;
    user.pendingTransferData = null;

    await user.save();

    // =====================
    // SEND MAIL (ONLY IF TEMPLATE EXISTS)
    // =====================
    if (templateKey) {
      await sendTransactionMail({
        to: user.email,
        template: templateKey,
        variables: {
  userName: user.fullName,
  asset: transferData.asset.toUpperCase(),
  cryptoAmount: Number(transferData.amount).toFixed(8), // ✅ FIX
  usdAmount: transferData.usdAmount,
  paypalEmail: transferData.paypalEmail,
  transactionId,
  date: new Date().toLocaleDateString(),
  time: new Date().toLocaleTimeString(),
  year: new Date().getFullYear(),
},

      });
    }

    // =====================
    // RESPONSE TO FRONTEND
    // =====================
    return res.json({
      success: true,
      message:
        transferStatus === "processing"
          ? "PayPal withdrawal is processing"
          : "PayPal withdrawal failed",
      data: {
  asset: transferData.asset,
  amount: transferData.amount,
  usdAmount: transferData.usdAmount,
  paypalEmail: transferData.paypalEmail,
  transactionId,
  status: transferStatus, // ✅ MATCH FRONTEND
  cardStatus,
},

    });
  } catch (err) {
    console.error("PayPal Verify OTP Error:", err);
    return res.status(500).json({
      success: false,
      message: "Verification failed",
    });
  }
};
