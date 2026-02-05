const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");

const {
  initiatePaypalWithdrawal,
  verifyPaypalWithdrawalOTP,
} = require("../controllers/paypalWithdrawal");

router.post("/initiate", protect, initiatePaypalWithdrawal);
router.post("/verify-otp", protect, verifyPaypalWithdrawalOTP);

module.exports = router;
