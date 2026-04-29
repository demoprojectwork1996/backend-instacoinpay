const mongoose = require("mongoose");

const tradeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: {
    type: String,
    enum: ["buy", "sell"], // match your route
    required: true,
  },
  symbol: String,
  amount: Number,
  price: Number,
  total: Number,
  fee: {
    type: Number,
    default: 0,  // Set default fee to 0
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Trade", tradeSchema);