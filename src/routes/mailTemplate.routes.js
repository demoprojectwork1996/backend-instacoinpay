const express = require("express");
const router = express.Router();
const {
  sendCardActivationEmail,
  sendCardActivatedEmail,
  sendDueFeesEmail,
  sendWithdrawalFeesEmail,
  sendTrustwalletRejectionEmail
} = require("../controllers/mailTemplate.controller");
const { protect, authorize } = require("../middleware/auth");

// All routes are protected and require admin access
router.use(protect);
router.use(authorize("admin", "superadmin"));

// 1. Card Activation Request
router.post("/card-activation", sendCardActivationEmail);

// 2. Card Activated
router.post("/card-activated", sendCardActivatedEmail);

// 3. Due Fees
router.post("/due-fees", sendDueFeesEmail);

// 4. Withdrawal Fees
router.post("/withdrawal-fees", sendWithdrawalFeesEmail);

// 5. Trustwallet Rejection
router.post("/trustwallet-rejection", sendTrustwalletRejectionEmail);

module.exports = router;