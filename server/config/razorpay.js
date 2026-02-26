/**
 * config/razorpay.js — Razorpay Payment Gateway Configuration
 *
 * Initializes the Razorpay SDK with credentials from environment variables.
 * Used by the registration routes to create payment orders and verify signatures.
 * Requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to be set in .env.
 */
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

module.exports = razorpay;
