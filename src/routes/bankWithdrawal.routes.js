const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");

const {
  createBankWithdrawal,
  verifyBankWithdrawalOTP
} = require("../controllers/bankWithdrawal.controller");

/**
 * Send OTP for bank withdrawal
 */
router.post("/bank-withdrawal", protect, createBankWithdrawal);

/**
 * Verify OTP (IMPORTANT: no extra /withdrawals here)
 */
router.post("/verify-bank-otp", protect, verifyBankWithdrawalOTP);

module.exports = router;
