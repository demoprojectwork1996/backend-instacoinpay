const Transfer = require("../models/Transfer");
const User = require("../models/User");  // ✅ IMPORT ADDED - THIS FIXES THE ERROR

/**
 * =====================
 * GET PENDING TRANSACTIONS
 * =====================
 */
exports.getPendingTransactions = async (req, res) => {
  try {
    const transfers = await Transfer.find({
      status: { $in: ["pending", "processing", "pending_otp"] }
    })
      .populate("fromUser", "fullName email")
      .sort({ createdAt: -1 });

    const data = transfers.map((tx) => {
      let parsedNotes = {};
      try {
        parsedNotes = JSON.parse(tx.notes || "{}");
      } catch (e) {}

      /* =========================
         METHOD DETECTION
      ========================== */
      let method = "Crypto Coin";

      if (parsedNotes.type === "BANK_WITHDRAWAL") {
        method = "Bank Transfer";
      } else if (parsedNotes.type === "PAYPAL_WITHDRAWAL") {
        method = "Paypal";
      }

      return {
        id: tx._id,
        name: tx.fromUser?.fullName || "—",
        email: tx.fromUser?.email || "—",
        amount: `$${tx.value || 0}`,
        method,
        txid: tx.transactionId || tx._id,
        confirmations: tx.confirmations?.length
          ? tx.confirmations
          : [false, false, false, false],
        date: tx.createdAt.toISOString().split("T")[0],
        time: tx.createdAt.toTimeString().slice(0, 5),
      };
    });

    res.json({
      success: true,
      data,
    });

  } catch (err) {
    console.error("Admin pending tx error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pending transactions",
    });
  }
};

/**
 * =====================
 * APPROVE / REJECT / PENDING TRANSACTION
 * =====================
 */
exports.updateTransactionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, confirmations } = req.body;

    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const tx = await Transfer.findById(id);

    if (!tx) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    if (["completed", "failed"].includes(tx.status)) {
      return res.status(400).json({
        success: false,
        message: "Transaction already finalized",
      });
    }

    // =========================
    // PENDING → SAVE CONFIRMATIONS
    // =========================
    if (status === "pending") {
      tx.confirmations = confirmations;
      tx.status = "processing";
      await tx.save();

      return res.json({
        success: true,
        message: "Confirmations updated (still pending)",
      });
    }

    // =========================
    // APPROVED
    // =========================
    if (status === "approved") {
      tx.status = "completed";
      tx.completedAt = new Date();
      await tx.save();
    }

    // =========================
    // REJECTED - WITH REFUND
    // =========================
    if (status === "rejected") {

      // 1️⃣ Get the user who sent the transaction
      const user = await User.findById(tx.fromUser);
      
      if (!user) {
        console.log("❌ User not found for refund:", tx.fromUser);
        return res.status(404).json({
          success: false,
          message: "User not found for refund",
        });
      }

      console.log("💰 Refunding to user:", user.email);
      console.log("  - Asset:", tx.asset);
      console.log("  - Amount:", tx.amount);
      console.log("  - Current balance:", user.walletBalances[tx.asset]);

      // 2️⃣ Detect asset and refund amount to correct wallet
      const assetKey = tx.asset;  // Keep original asset key (usdtTron, usdtBnb, btc, etc.)
      
      if (assetKey && user.walletBalances && user.walletBalances[assetKey] !== undefined) {
        // Add the amount back to user's wallet
        user.walletBalances[assetKey] = Number(user.walletBalances[assetKey]) + Number(tx.amount);
        
        // Save the updated user
        await user.save();
        
        console.log("  ✅ Refund successful!");
        console.log("  - New balance:", user.walletBalances[assetKey]);
      } else {
        console.log("❌ Asset key not found in wallet balances:", assetKey);
        console.log("Available wallets:", Object.keys(user.walletBalances || {}));
      }

      // 3️⃣ Mark transaction as failed
      tx.status = "failed";
      await tx.save();
    }

    res.json({
      success: true,
      message: `Transaction ${status} successfully`,
    });

  } catch (err) {
    console.error("Update tx error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update transaction",
    });
  }
};