const User = require("../models/User");
const Transfer = require("../models/Transfer");
const ReferralReward = require("../models/ReferralReward");

// ─── mirrors the same generator used in authController ───────────────────────
const generateWalletAddress = (asset) => {
  const rand = (len) => {
    const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";
    for (let i = 0; i < len; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  switch (asset) {
    case "usdtBnb":
    case "bnb":
    case "eth":      return `0x${rand(34)}`;
    case "usdtTron":
    case "trx":      return `T${rand(34)}`;
    case "btc":      return `bc1q${rand(34)}`;
    case "sol":      return rand(34);
    case "xrp":      return `r${rand(34)}`;
    case "doge":     return `D${rand(34)}`;
    case "ltc":      return `L${rand(34)}`;
    default:         return `0x${rand(34)}`;
  }
};

// ─── generates a realistic-looking BEP-20 transaction hash ───────────────────
const generateTxHash = () => {
  const hex = "0123456789abcdef";
  let hash = "0x";
  for (let i = 0; i < 64; i++) {
    hash += hex.charAt(Math.floor(Math.random() * hex.length));
  }
  return hash;
};

exports.processReferralReward = async (newUser) => {
  if (!newUser.referredBy || newUser.referralRewarded) return;

  const referrer = await User.findOne({
    referralCode: newUser.referredBy,
  });

  if (!referrer) return;

  const REWARD_AMOUNT = 25;
  const REWARD_ASSET  = "usdtBnb";

  // ─── 1. Credit both wallets ───────────────────────────────────────────────
  referrer.walletBalances[REWARD_ASSET] += REWARD_AMOUNT;
  newUser.walletBalances[REWARD_ASSET]  += REWARD_AMOUNT;
  newUser.referralRewarded = true;

  await referrer.save();
  await newUser.save();

  // ─── 2. Persist reward record (guards against double-processing) ──────────
  try {
    await ReferralReward.create({
      referrerEmail: referrer.email,
      referredEmail: newUser.email,
      amount:        REWARD_AMOUNT,
      currency:      REWARD_ASSET,
    });
  } catch (err) {
    if (err.code === 11000) return; // already rewarded
    throw err;
  }

  // ─── 3. Resolve wallet addresses ─────────────────────────────────────────
  const referrerAddress =
    referrer.walletAddresses?.[REWARD_ASSET] || generateWalletAddress(REWARD_ASSET);

  const newUserAddress =
    newUser.walletAddresses?.[REWARD_ASSET] || generateWalletAddress(REWARD_ASSET);

  // ─── 4. Shared helpers ────────────────────────────────────────────────────
  const now      = new Date();
  const makeTxId = (prefix) =>
    `${prefix}-REF-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  // Each transfer gets its own unique display hash shown to the user
  const referrerDisplayTxId = generateTxHash();
  const newUserDisplayTxId  = generateTxHash();

  // ─── 5a. Transfer for the REFERRER ───────────────────────────────────────
  await Transfer.create({
    fromUser:      referrer._id,
    toUser:        referrer._id,
    fromAddress:   referrerDisplayTxId,   // ✅ stored here — used as "From" display in frontend
    toAddress:     referrerAddress,
    asset:         REWARD_ASSET,
    amount:        REWARD_AMOUNT,
    value:         REWARD_AMOUNT,
    status:        "completed",
    type:          "Receive",
    notes:         JSON.stringify({
      type:          "REFERRAL_REWARD",
      displayTxId:   referrerDisplayTxId,
    }),
    transactionId: makeTxId("REF-R"),
    completedAt:   now,
    createdAt:     now,
  });

  // ─── 5b. Transfer for the NEW USER (welcome bonus) ────────────────────────
  await Transfer.create({
    fromUser:      newUser._id,
    toUser:        newUser._id,
    fromAddress:   newUserDisplayTxId,    // ✅ stored here — used as "From" display in frontend
    toAddress:     newUserAddress,
    asset:         REWARD_ASSET,
    amount:        REWARD_AMOUNT,
    value:         REWARD_AMOUNT,
    status:        "completed",
    type:          "Receive",
    notes:         JSON.stringify({
      type:          "REFERRAL_REWARD",
      displayTxId:   newUserDisplayTxId,
    }),
    transactionId: makeTxId("REF-N"),
    completedAt:   now,
    createdAt:     now,
  });
};