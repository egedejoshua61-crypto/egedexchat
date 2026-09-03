const router = require('express').Router();
const User = require('../models/User');
const Payment = require('../models/Payment');
const { verifyAuth } = require('../middleware/auth');

// Initialize Verification Payment (₦500)
router.post('/verify-request', verifyAuth, async (req, res) => {
    const { provider, reference } = req.body;
    
    // Create payment record
    const newPayment = new Payment({
        userId: req.user.id,
        amount: 500,
        type: 'VERIFICATION',
        status: 'PENDING',
        reference: reference,
        provider: provider // 'PAYSTACK' or 'OPAY'
    });

    await newPayment.save();
    res.status(200).json({ message: "Verification request submitted for review." });
});

// OPay Manual Payment (Account: 8164581424)
router.post('/opay-confirm', verifyAuth, async (req, res) => {
    const { reference, type } = req.body; // type: 'VERIFY' or 'UNBAN'
    // Log the manual reference for Admin Dashboard review
    const request = new Payment({
        userId: req.user.id,
        amount: type === 'VERIFY' ? 500 : 200,
        type: type,
        status: 'UNDER_REVIEW',
        reference: reference,
        provider: 'OPAY_MANUAL'
    });
    await request.save();
    res.json({ success: true, message: "Payment receipt sent to Admin." });
});

module.exports = router;