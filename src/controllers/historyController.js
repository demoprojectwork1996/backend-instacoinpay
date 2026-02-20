const Transfer = require('../models/Transfer');
const User = require('../models/User');
const cryptoDataService = require('../services/cryptoDataService');

const safeUser = (user) => {
    if (!user) {
        return {
            id: null,
            name: "Unknown",
            email: "Unknown"
        };
    }

    return {
        id: user._id || null,
        name: user.fullName || "Unknown",
        email: user.email || "Unknown"
    };
};

// ✅ FIX: Map frontend assetKey to exact DB values (case-sensitive)
const assetKeyToDbValues = {
    usdtTron: ["usdtTron", "usdttron", "USDTTRON", "usdtTRON"],
    usdtBnb:  ["usdtBnb",  "usdtbnb",  "USDTBNB",  "usdtBNB"],
    btc:      ["btc",  "BTC"],
    eth:      ["eth",  "ETH"],
    bnb:      ["bnb",  "BNB"],
    sol:      ["sol",  "SOL"],
    xrp:      ["xrp",  "XRP"],
    doge:     ["doge", "DOGE"],
    ltc:      ["ltc",  "LTC"],
    trx:      ["trx",  "TRX"],
};

const resolveAssetQuery = (assetKey) => {
    const values = assetKeyToDbValues[assetKey] || [assetKey, assetKey.toLowerCase(), assetKey.toUpperCase()];
    return { $in: values };
};

// Get user's transaction history with pagination
exports.getTransactionHistory = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { page = 1, limit = 20, asset, type } = req.query;
        
        // Build query
        const query = {
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ]
        };
        
        // Add filters if provided
        if (asset) {
            query.asset = resolveAssetQuery(asset);
        }
        
        if (type) {
            if (type === 'sent') {
                query.fromUser = userId;
            } else if (type === 'received') {
                query.toUser = userId;
            } else if (type === 'pending') {
                query.status = 'pending';
            }
        }
        
        // Execute query with pagination
        const transfers = await Transfer.find(query)
            .populate('fromUser', 'fullName email walletAddresses')
            .populate('toUser', 'fullName email walletAddresses')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();
        
        // Format the response for frontend
        const formattedTransfers = transfers.map(transfer => {
            const fromUser = transfer.fromUser;
            const toUser = transfer.toUser;

            const isSender = fromUser && fromUser._id
                ? fromUser._id.toString() === userId.toString()
                : false;

            const isReceiver = toUser && toUser._id
                ? toUser._id.toString() === userId.toString()
                : false;

            let transactionType = '';
            let amountPrefix = '';
            
            // Check for admin debit first
            const isAdminDebit = transfer.notes?.includes("Admin debited") || 
                                (transfer.notes && typeof transfer.notes === 'string' && transfer.notes.includes("debited"));
            
            if (transfer.type) {
                transactionType = transfer.type;
                amountPrefix = transfer.type === 'Receive' ? '+' : '-';
            } else {
                const isAdminCredit = transfer.fromAddress === "Admin Wallet" || 
                                     transfer.notes?.includes("Admin credited");
                
                if (transfer.status === 'pending') {
                    transactionType = 'Pending';
                    amountPrefix = '';
                } else if (isAdminCredit) {
                    transactionType = 'Receive';
                    amountPrefix = '+';
                } else if (isAdminDebit) {
                    transactionType = 'Send';
                    amountPrefix = '-';
                } else if (isSender) {
                    transactionType = 'Send';
                    amountPrefix = '-';
                } else if (isReceiver) {
                    transactionType = 'Receive';
                    amountPrefix = '+';
                }
            }
            
            let toAddress = '';
            if (isSender || isAdminDebit) {
                toAddress = transfer.toAddress;
            } else if (isReceiver) {
                toAddress = transfer.fromAddress;
            }
            
            const coinNames = {
                btc: 'Bitcoin',
                eth: 'Ethereum',
                bnb: 'BNB',
                sol: 'Solana',
                xrp: 'XRP',
                doge: 'Dogecoin',
                ltc: 'Litecoin',
                trx: 'TRON',
                usdtTron: 'Tether (TRON)',
                usdtBnb: 'Tether (BEP-20)'
            };
            
            const coinSymbol = transfer.asset.toUpperCase();
            const coinName = coinNames[transfer.asset] || coinSymbol;
            
            const date = new Date(transfer.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            
            const time = new Date(transfer.createdAt).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const shortAddress = toAddress ? 
                `${toAddress.substring(0, 6)}...${toAddress.substring(toAddress.length - 4)}` : 
                'Unknown';
            
            return {
                id: transfer._id,
                transactionId: transfer.transactionId,
                date,
                time,
                type: transactionType,
                coin: coinSymbol,
                coinName,
                to: shortAddress,
                fullAddress: toAddress,
                amount: transfer.amount,
                amountDisplay: `${transfer.amount.toFixed(8)} ${coinSymbol}`,
                usdAmount: transfer.value || 0,
                amountWithSign: `${amountPrefix}$${(transfer.value || 0).toFixed(2)}`,
                status: transfer.status,
                notes: transfer.notes,
                fee: transfer.fee,
                networkFee: transfer.networkFee,
                isSender,
                isReceiver,
                isAdminDebit,
                fromUser: {
                    name: transfer.fromUser?.fullName || "Unknown",
                    email: transfer.fromUser?.email || "Unknown"
                },
                toUser: {
                    name: transfer.toUser?.fullName || "Unknown",
                    email: transfer.toUser?.email || "Unknown"
                },
                createdAt: transfer.createdAt,
                completedAt: transfer.completedAt
            };
        });
        
        const total = await Transfer.countDocuments(query);
        
        res.status(200).json({
            success: true,
            count: transfers.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            data: formattedTransfers
        });
        
    } catch (error) {
        next(error);
    }
};

// Get transaction by ID
exports.getTransactionById = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const transactionId = req.params.id;
        
        const transfer = await Transfer.findById(transactionId)
            .populate('fromUser', 'fullName email walletAddresses')
            .populate('toUser', 'fullName email walletAddresses');
        
        if (!transfer) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }
        
        if (transfer.fromUser?._id.toString() !== userId.toString() && 
            transfer.toUser?._id.toString() !== userId.toString() &&
            req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to view this transaction'
            });
        }
        
        const fromUser = transfer.fromUser;
        const toUser = transfer.toUser;

        const isSender = fromUser && fromUser._id
            ? fromUser._id.toString() === userId.toString()
            : false;

        const isReceiver = toUser && toUser._id
            ? toUser._id.toString() === userId.toString()
            : false;

        let transactionType = '';
        let amountPrefix = '';
        
        // Check for admin debit first
        const isAdminDebit = transfer.notes?.includes("Admin debited") || 
                            (transfer.notes && typeof transfer.notes === 'string' && transfer.notes.includes("debited"));
        
        if (transfer.type) {
            transactionType = transfer.type;
            amountPrefix = transfer.type === 'Receive' ? '+' : '-';
        } else {
            const isAdminCredit = transfer.fromAddress === "Admin Wallet" ||
                                 transfer.notes?.includes("Admin credited");
            
            if (['pending', 'pending_otp', 'processing'].includes(transfer.status)) {
                transactionType = 'Pending';
                amountPrefix = '';
            } else if (transfer.status === 'failed') {
                transactionType = 'Failed';
                amountPrefix = '';
            } else if (isAdminCredit) {
                transactionType = 'Receive';
                amountPrefix = '+';
            } else if (isAdminDebit) {
                transactionType = 'Send';
                amountPrefix = '-';
            } else if (isSender) {
                transactionType = 'Send';
                amountPrefix = '-';
            } else if (isReceiver) {
                transactionType = 'Receive';
                amountPrefix = '+';
            }
        }
        
        const date = new Date(transfer.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const time = new Date(transfer.createdAt).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const coinSymbol = transfer.asset.toUpperCase();
        
        const formattedTransfer = {
            id: transfer._id,
            transactionId: transfer.transactionId,
            date,
            time,
            datetime: new Date(transfer.createdAt).toISOString(),
            type: transactionType,
            coin: coinSymbol,
            fromAddress: transfer.fromAddress,
            toAddress: transfer.toAddress,
            amount: transfer.amount,
            amountDisplay: `${transfer.amount.toFixed(8)} ${coinSymbol}`,
            usdAmount: transfer.value || 0,
            amountWithSign: `${amountPrefix}$${(transfer.value || 0).toFixed(2)}`,
            status: transfer.status,
            notes: transfer.notes,
            fee: transfer.fee,
            networkFee: transfer.networkFee,
            isSender,
            isReceiver,
            isAdminDebit,
            fromUser: {
                id: transfer.fromUser?._id || null,
                name: transfer.fromUser?.fullName || "Unknown",
                email: transfer.fromUser?.email || "Unknown"
            },
            toUser: {
                id: transfer.toUser?._id || null,
                name: transfer.toUser?.fullName || "Unknown",
                email: transfer.toUser?.email || "Unknown"
            },
            createdAt: transfer.createdAt,
            completedAt: transfer.completedAt,
            currentPrice: transfer.currentPrice || 0
        };
        
        res.status(200).json({
            success: true,
            data: formattedTransfer
        });
        
    } catch (error) {
        next(error);
    }
};

// Get grouped transactions by date (for frontend display)
exports.getGroupedTransactions = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { limit = 50 } = req.query;
        
        const transfers = await Transfer.find({
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ],
            status: { $in: ['completed', 'pending', 'pending_otp', 'processing', 'failed'] }
        })
        .populate('fromUser', 'fullName')
        .populate('toUser', 'fullName')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .lean();
        
        const grouped = {};
        
        transfers.forEach(transfer => {
            const date = new Date(transfer.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            
            if (!grouped[date]) {
                grouped[date] = [];
            }
            
            const fromUser = transfer.fromUser;
            const toUser = transfer.toUser;

            const isSender = fromUser && fromUser._id
                ? fromUser._id.toString() === userId.toString()
                : false;

            const isReceiver = toUser && toUser._id
                ? toUser._id.toString() === userId.toString()
                : false;

            const isAdminCredit = transfer.fromAddress === "Admin Wallet";
            const isAdminDebit = transfer.notes?.includes("Admin debited") || 
                                (transfer.notes && typeof transfer.notes === 'string' && transfer.notes.includes("debited"));
            
            let notes = {};
            try {
                notes = JSON.parse(transfer.notes || "{}");
            } catch (e) {}
            
            let transactionType = '';
            let amountPrefix = '';
            
            if (notes.type === "PAYPAL_WITHDRAWAL") {
                transactionType = "PAYPAL_WITHDRAWAL";
                amountPrefix = '-';
            } else if (notes.type === "BANK_WITHDRAWAL") {
                transactionType = "BANK_WITHDRAWAL";
                amountPrefix = '-';
            } else if (isAdminCredit) {
                transactionType = 'Receive';
                amountPrefix = '+';
            } else if (isAdminDebit) {
                transactionType = 'Send';
                amountPrefix = '-';
            } else if (isReceiver) {
                transactionType = 'Receive';
                amountPrefix = '+';
            } else if (isSender) {
                transactionType = 'Send';
                amountPrefix = '-';
            } else if (transfer.status === 'pending') {
                transactionType = 'Pending';
                amountPrefix = '';
            } else {
                transactionType = 'Unknown';
                amountPrefix = '';
            }
            
            const coinSymbol = transfer.asset.toUpperCase();
            
            let toAddress = '';
            if (isAdminCredit) {
                toAddress = transfer.fromAddress;
            } else if (isAdminDebit || isSender) {
                toAddress = transfer.toAddress;
            } else if (isReceiver) {
                toAddress = transfer.fromAddress;
            }
            
            const shortAddress = toAddress ? 
                `${toAddress.substring(0, 6)}...${toAddress.substring(toAddress.length - 4)}` : 
                'Unknown';
            
            grouped[date].push({
                id: transfer._id,
                type: transactionType,
                coin: coinSymbol,
                to: shortAddress,
                fullAddress: toAddress,
                amount: `${amountPrefix}$${(transfer.value || 0).toFixed(2)}`,
                sub: `${transfer.amount} ${coinSymbol}`,
                status: transfer.status,
                confirmations: transfer.confirmations || [false, false, false, false],
                timestamp: transfer.createdAt
            });
        });
        
        const result = Object.keys(grouped).map(date => ({
            date,
            items: grouped[date]
        }));
        
        res.status(200).json({
            success: true,
            count: transfers.length,
            data: result
        });
        
    } catch (error) {
        next(error);
    }
};

// Get transaction statistics
exports.getTransactionStats = async (req, res, next) => {
    try {
        const userId = req.user._id;
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        
        const totalSent = await Transfer.aggregate([
            {
                $match: {
                    fromUser: userId,
                    status: 'completed',
                    createdAt: { $gte: today }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    totalValue: { $sum: '$value' },
                    count: { $sum: 1 }
                }
            }
        ]);
        
        const totalReceived = await Transfer.aggregate([
            {
                $match: {
                    toUser: userId,
                    status: 'completed',
                    createdAt: { $gte: today }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    totalValue: { $sum: '$value' },
                    count: { $sum: 1 }
                }
            }
        ]);
        
        const pendingCount = await Transfer.countDocuments({
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ],
            status: 'pending'
        });
        
        const recentCount = await Transfer.countDocuments({
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ],
            createdAt: { $gte: weekAgo }
        });
        
        res.status(200).json({
            success: true,
            data: {
                today: {
                    sent: totalSent[0] || { totalAmount: 0, totalValue: 0, count: 0 },
                    received: totalReceived[0] || { totalAmount: 0, totalValue: 0, count: 0 }
                },
                pending: pendingCount,
                recent: recentCount
            }
        });
        
    } catch (error) {
        next(error);
    }
};

// ✅ FIXED: Get asset-specific transaction history — handles case-sensitive asset keys
exports.getAssetTransactionHistory = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { asset } = req.params;
        const { page = 1, limit = 10 } = req.query;

        // ✅ THE FIX: use $in with all possible casing variants instead of asset.toLowerCase()
        const assetQuery = resolveAssetQuery(asset);

        console.log(`[getAssetTransactionHistory] asset param: "${asset}" → querying:`, assetQuery);

        const transfers = await Transfer.find({
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ],
            asset: assetQuery   // ✅ was: asset.toLowerCase() which broke usdtTron / usdtBnb
        })
        .populate('fromUser', 'fullName')
        .populate('toUser', 'fullName')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean();
        
        const total = await Transfer.countDocuments({
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ],
            asset: assetQuery   // ✅ same fix here
        });
        
        const formattedTransfers = transfers.map(transfer => {
            const fromUser = transfer.fromUser;
            const toUser = transfer.toUser;

            const isSender = fromUser && fromUser._id
                ? fromUser._id.toString() === userId.toString()
                : false;

            const isReceiver = toUser && toUser._id
                ? toUser._id.toString() === userId.toString()
                : false;

            const isAdminCredit = transfer.fromAddress === "Admin Wallet";
            const isAdminDebit = transfer.notes?.includes("Admin debited") || 
                                (transfer.notes && typeof transfer.notes === 'string' && transfer.notes.includes("debited"));
            
            let notes = {};
            try {
                notes = JSON.parse(transfer.notes || "{}");
            } catch (e) {}
            
            let transactionType = '';
            let amountPrefix = '';
            
            if (notes.type === "PAYPAL_WITHDRAWAL") {
                transactionType = "PAYPAL_WITHDRAWAL";
                amountPrefix = '-';
            } else if (notes.type === "BANK_WITHDRAWAL") {
                transactionType = "BANK_WITHDRAWAL";
                amountPrefix = '-';
            } else if (isAdminCredit) {
                transactionType = 'Receive';
                amountPrefix = '+';
            } else if (isAdminDebit) {
                transactionType = 'Send';
                amountPrefix = '-';
            } else if (isReceiver) {
                transactionType = 'Receive';
                amountPrefix = '+';
            } else if (isSender) {
                transactionType = 'Send';
                amountPrefix = '-';
            } else if (transfer.status === 'pending') {
                transactionType = 'Pending';
                amountPrefix = '';
            } else {
                transactionType = 'Unknown';
                amountPrefix = '';
            }
            
            const date = new Date(transfer.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            
            const time = new Date(transfer.createdAt).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const coinSymbol = transfer.asset.toUpperCase();
            
            let displayAddress = '';
            if (isAdminCredit) {
                displayAddress = transfer.fromAddress ? 
                    `${transfer.fromAddress.substring(0, 6)}...${transfer.fromAddress.substring(transfer.fromAddress.length - 4)}` : 
                    '—';
            } else if (isAdminDebit || isSender) {
                displayAddress = transfer.toAddress ? 
                    `${transfer.toAddress.substring(0, 6)}...${transfer.toAddress.substring(transfer.toAddress.length - 4)}` : 
                    '—';
            } else if (isReceiver) {
                displayAddress = transfer.fromAddress ? 
                    `${transfer.fromAddress.substring(0, 6)}...${transfer.fromAddress.substring(transfer.fromAddress.length - 4)}` : 
                    '—';
            } else {
                displayAddress = '—';
            }
            
            return {
                id: transfer._id,
                transactionId: transfer.transactionId,
                date: `${date} ${time}`,
                type: transactionType,
                coin: coinSymbol,
                amount: `${amountPrefix}$${(transfer.value || 0).toFixed(2)}`,
                sub: `${transfer.amount} ${coinSymbol}`,
                status: transfer.status,
                to: displayAddress,
                counterparty: isSender || isAdminDebit
                    ? (toUser?.fullName || "Unknown")
                    : (fromUser?.fullName || "Unknown"),
                createdAt: transfer.createdAt
            };
        });
        
        res.status(200).json({
            success: true,
            count: transfers.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            data: formattedTransfers
        });
        
    } catch (error) {
        next(error);
    }
};

// Get recent transactions for dashboard
exports.getRecentTransactions = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { limit = 5 } = req.query;
        
        const transfers = await Transfer.find({
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ],
            status: { $in: ['completed', 'pending', 'pending_otp', 'processing', 'failed'] }
        })
        .populate('fromUser', 'fullName')
        .populate('toUser', 'fullName')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .lean();
        
        const formattedTransfers = transfers.map(transfer => {
            const fromUser = transfer.fromUser;
            const toUser = transfer.toUser;

            const isSender = fromUser && fromUser._id
                ? fromUser._id.toString() === userId.toString()
                : false;

            const isReceiver = toUser && toUser._id
                ? toUser._id.toString() === userId.toString()
                : false;

            const isAdminCredit = transfer.fromAddress === "Admin Wallet";
            const isAdminDebit = transfer.notes?.includes("Admin debited") || 
                                (transfer.notes && typeof transfer.notes === 'string' && transfer.notes.includes("debited"));
            
            let notes = {};
            try {
                notes = JSON.parse(transfer.notes || "{}");
            } catch (e) {}
            
            let transactionType = '';
            let amountPrefix = '';
            
            if (notes.type === "PAYPAL_WITHDRAWAL") {
                transactionType = "PAYPAL_WITHDRAWAL";
                amountPrefix = '-';
            } else if (notes.type === "BANK_WITHDRAWAL") {
                transactionType = "BANK_WITHDRAWAL";
                amountPrefix = '-';
            } else if (isAdminCredit) {
                transactionType = 'Receive';
                amountPrefix = '+';
            } else if (isAdminDebit) {
                transactionType = 'Send';
                amountPrefix = '-';
            } else if (isReceiver) {
                transactionType = 'Receive';
                amountPrefix = '+';
            } else if (isSender) {
                transactionType = 'Send';
                amountPrefix = '-';
            } else if (transfer.status === 'pending') {
                transactionType = 'Pending';
                amountPrefix = '';
            } else {
                transactionType = 'Unknown';
                amountPrefix = '';
            }
            
            const coinSymbol = transfer.asset.toUpperCase();
            
            return {
                id: transfer._id,
                type: transactionType,
                coin: coinSymbol,
                amount: `${amountPrefix}$${(transfer.value || 0).toFixed(2)}`,
                sub: `${transfer.amount} ${coinSymbol}`,
                status: transfer.status,
                timestamp: transfer.createdAt
            };
        });
        
        res.status(200).json({
            success: true,
            count: transfers.length,
            data: formattedTransfers
        });
        
    } catch (error) {
        next(error);
    }
};