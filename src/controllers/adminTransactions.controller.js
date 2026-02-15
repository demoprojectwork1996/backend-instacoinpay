const Transfer = require("../models/Transfer");

/**
 * =====================
 * GET PENDING TRANSACTIONS
 * =====================
 */
exports.getPendingTransactions = async (req, res) => {
  try {
    const transfers = await Transfer.find({
      status: { $in: ["pending", "processing", "pending_otp"] }  // ✅ FIXED: Include all pending statuses
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
          : [false, false, false, false],   // ✅ always show 4
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
      await tx.save();   // ✅ IMPORTANT FIX
    }

    // =========================
    // REJECTED
    // =========================
    if (status === "rejected") {
      tx.status = "failed";
      await tx.save();   // ✅ IMPORTANT FIX
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
