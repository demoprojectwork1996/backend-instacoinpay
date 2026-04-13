const express = require("express");
const router = express.Router();
const DebitCardApplication = require("../models/DebitCardApplication");

/* =========================
   APPLY DEBIT CARD (USER)
   ONE EMAIL = ONE FILE
========================= */
router.post("/apply", async (req, res) => {
  try {
    const { email } = req.body;

    const existing = await DebitCardApplication.findOne({ email });

    if (existing) {
      existing.cardType = req.body.cardType || existing.cardType;
      existing.fullName = req.body.fullName || existing.fullName;
      existing.whatsapp = req.body.whatsapp || existing.whatsapp;
      existing.address = req.body.address || existing.address;
      existing.zipcode = req.body.zipcode || existing.zipcode;
      existing.country = req.body.country || existing.country;
      existing.status = "INACTIVE";

      await existing.save();

      return res.status(200).json({
        success: true,
        message: "Application updated successfully",
        data: existing,
        mode: "UPDATED",
      });
    }

    const application = new DebitCardApplication({
      ...req.body,
      status: "INACTIVE",
    });

    await application.save();

    res.status(201).json({
      success: true,
      message: "Debit card application submitted",
      data: application,
      mode: "CREATED",
    });

  } catch (error) {
    console.error('Apply error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/* =========================
   GET APPLICATION BY EMAIL
========================= */
router.get("/by-email/:email", async (req, res) => {
  try {
    const emailLower = req.params.email.toLowerCase().trim();

    let card = await DebitCardApplication.findOne({ email: emailLower });

    if (!card) {
      card = await DebitCardApplication.create({
        email: emailLower,
        fullName: "N/A",
        cardType: "Classic VisaCard",
        cardNumber: "",
        expiry: "",
        cvv: "",
        whatsapp: "",
        address: "",
        zipcode: "",
        country: "",
        status: "INACTIVE",
      });
      console.log("📝 Blank card record created for:", emailLower);
    }

    console.log("📧 Returning card for email:", emailLower, "with status:", card.status);

    res.json({ success: true, data: card });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* =========================
   UPDATE CARD DETAILS + STATUS (ADMIN)
========================= */
router.put("/update/:id", async (req, res) => {
  try {
    const updated = await DebitCardApplication.findByIdAndUpdate(
      req.params.id,
      {
        fullName: req.body.fullName,
        cardNumber: req.body.cardNumber,
        expiry: req.body.expiry,
        cvv: req.body.cvv,
        status: req.body.status,
        cardType: req.body.cardType,
      },
      { new: true }
    );

    res.json({
      success: true,
      message: "Card updated successfully",
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* =========================
   GET ALL CARD APPLICATIONS (ADMIN)
========================= */
router.get("/admin/active-pending", async (req, res) => {
  try {
    const cards = await DebitCardApplication.find({
      status: { $in: ["INACTIVE", "PENDING", "ACTIVATE"] }
    }).select("fullName email status cardType");

    console.log('Found cards:', cards.length);
    console.log('Statuses:', cards.map(c => c.status));

    res.json({ success: true, data: cards });
  } catch (err) {
    console.error('Error in admin/active-pending:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;