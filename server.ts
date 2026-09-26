import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import Stripe from "stripe";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Lazy Stripe Client getter
let stripeClient: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (secretKey && secretKey.trim().length > 0) {
      stripeClient = new Stripe(secretKey);
    }
  }
  return stripeClient;
}

// API Routes

// 1. Check Stripe Config status
app.get("/api/stripe/config", (req, res) => {
  const stripe = getStripe();
  const publishableKey = process.env.VITE_STRIPE_PUBLISHABLE_KEY || null;
  res.json({
    configured: !!stripe,
    hasPublishableKey: !!publishableKey,
    publishableKey: publishableKey ? `${publishableKey.substring(0, 7)}...` : null
  });
});

// 2. Verify a completed Checkout Session (used when Stripe redirects back after real payment).
// Never trust the success_url query params alone - they're client-controlled. This asks Stripe
// directly whether the session actually has a paid status before the app records anything.
app.get("/api/stripe/verify-session", async (req, res) => {
  try {
    const sessionId = req.query.session_id as string;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing session_id" });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.status(400).json({ error: "Stripe is not configured" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.json({ verified: false, paymentStatus: session.payment_status });
    }

    const metadata = session.metadata || {};
    const amountTotal = (session.amount_total || 0) / 100;
    const platformFeeAmount = Number(metadata.platformFeeAmount || 0);

    res.json({
      verified: true,
      memberId: metadata.memberId || "",
      memberName: metadata.memberName || "",
      isLoanPayment: metadata.isLoanPayment === "true",
      loanNumber: metadata.loanNumber ? Number(metadata.loanNumber) : undefined,
      monthKey: metadata.monthKey || "",
      monthName: metadata.monthName || "",
      year: metadata.year || "",
      amountTotal,
      platformFeeAmount,
      baseAmount: Math.round((amountTotal - platformFeeAmount) * 100) / 100
    });
  } catch (error: any) {
    console.error("Stripe Session Verification error:", error);
    res.status(500).json({ error: error.message || "Failed to verify session" });
  }
});

// 3. Create Stripe Checkout Session
app.post("/api/stripe/create-checkout-session", async (req, res) => {
  try {
    const {
      memberId,
      memberName,
      amount,
      monthName,
      monthKey,
      year,
      description,
      isLoanPayment,
      loanNumber
    } = req.body;

    const numericAmount = Math.round(Number(amount || 60) * 100); // Stripe uses cents
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    // Platform & Development Fee: 1.5% on loan repayments only, per the signed Loan Agreement's
    // fee disclosure. Charged as its own visible line item, never folded into the loan amount.
    const PLATFORM_FEE_RATE = 0.015;
    const platformFeeAmount = isLoanPayment ? Math.round(numericAmount * PLATFORM_FEE_RATE) : 0;

    const stripe = getStripe();
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

    if (!stripe) {
      // Demo / Simulation Mode when Stripe Key is not set in environment
      return res.json({
        demoMode: true,
        message: "Stripe API key not found in secrets. Instant simulation mode activated.",
        paymentDetails: {
          memberId,
          memberName,
          amount: numericAmount / 100,
          platformFeeAmount: platformFeeAmount / 100,
          totalCharged: (numericAmount + platformFeeAmount) / 100,
          description: description || `Millionaires Club Dues (${monthName} ${year})`,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Real Stripe Checkout Session Creation
    const itemTitle = isLoanPayment
      ? `Millionaires Club Loan Repayment #${loanNumber}`
      : `Millionaires Club Monthly Dues (${monthName} ${year})`;

    const lineItems: any[] = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: itemTitle,
            description: `Payment by ${memberName} (${memberId}) - ${description || 'Official Fund Settlement'}`
          },
          unit_amount: numericAmount
        },
        quantity: 1
      }
    ];

    if (platformFeeAmount > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: `Platform & Development Fee (${(PLATFORM_FEE_RATE * 100).toFixed(0)}%)`,
            description: "Covers payment processing costs and ongoing software platform development/maintenance, per Loan Agreement."
          },
          unit_amount: platformFeeAmount
        },
        quantity: 1
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "us_bank_account"],
      payment_method_options: {
        us_bank_account: {
          financial_connections: {
            permissions: ["payment_method", "balances"]
          }
        }
      },
      mode: "payment",
      line_items: lineItems,
      metadata: {
        memberId,
        memberName,
        monthName: monthName || '',
        monthKey: monthKey || '',
        year: String(year || ''),
        isLoanPayment: String(!!isLoanPayment),
        loanNumber: loanNumber || '',
        platformFeeAmount: String(platformFeeAmount / 100)
      },
      success_url: `${appUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}&member=${encodeURIComponent(memberId)}&month=${encodeURIComponent(monthName || '')}&year=${encodeURIComponent(year || '')}`,
      cancel_url: `${appUrl}/?payment=cancelled`
    });

    res.json({ url: session.url, demoMode: false });
  } catch (error: any) {
    console.error("Stripe Checkout Session error:", error);
    res.status(500).json({ error: error.message || "Failed to create checkout session" });
  }
});

// Vite Middleware & Production Static Serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
