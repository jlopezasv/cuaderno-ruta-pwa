import Stripe from 'stripe';

const PRICE_MONTHLY = 'price_1TNpMxC03Kg4wBdS3eqhhVsg';
const PRICE_ANNUAL  = 'price_1TNpNyC03Kg4wBdSHfAUkSeB';
const SB_URL        = 'https://glyexutcypmhkndvmcxd.supabase.co';
const APP_URL       = 'https://tacografo-pro.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
      code: 'STRIPE_METHOD_NOT_ALLOWED',
    });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch(_) {
      return res.status(400).json({
        ok: false,
        error: 'JSON inválido',
        code: 'STRIPE_BAD_REQUEST',
      });
    }
  }

  const { action, user_id, email, plan, nombre } = body;

  // ── CREAR SESIÓN DE PAGO ──
  if (action === 'create_checkout') {
    if (!user_id || !email || !plan) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan datos',
        code: 'STRIPE_BAD_REQUEST',
      });
    }
    const priceId = plan === 'annual' ? PRICE_ANNUAL : PRICE_MONTHLY;
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer_email: email,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${APP_URL}?pago=ok&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${APP_URL}?pago=cancelado`,
        metadata: { user_id, plan },
        locale: 'es',
      });
      return res.status(200).json({ ok: true, url: session.url });
    } catch(e) {
      return res.status(500).json({
        ok: false,
        error: e.message,
        code: 'STRIPE_INTERNAL',
      });
    }
  }

  // ── VERIFICAR SUSCRIPCIÓN ──
  if (action === 'check_subscription') {
    if (!user_id) {
      return res.status(400).json({
        ok: false,
        error: 'Falta user_id',
        code: 'STRIPE_BAD_REQUEST',
      });
    }
    try {
      const r = await fetch(`${SB_URL}/rest/v1/subscriptions?user_id=eq.${user_id}`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      const rows = await r.json();
      if (!rows.length) {
        // Primera vez — crear trial de 14 días
        const trialEnd = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
        await fetch(`${SB_URL}/rest/v1/subscriptions`, {
          method: 'POST',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ user_id, plan: 'trial', status: 'trial', trial_ends_at: trialEnd })
        });
        return res.status(200).json({ ok: true, status: 'trial', trial_ends_at: trialEnd, days_left: 14 });
      }
      const sub = rows[0];
      const now = new Date();
      if (sub.status === 'trial') {
        const trialEnd = new Date(sub.trial_ends_at);
        const daysLeft = Math.ceil((trialEnd - now) / (24 * 3600 * 1000));
        if (daysLeft <= 0) return res.status(200).json({ ok: true, status: 'expired', days_left: 0 });
        return res.status(200).json({ ok: true, status: 'trial', trial_ends_at: sub.trial_ends_at, days_left: daysLeft });
      }
      if (sub.status === 'active') {
        return res.status(200).json({ ok: true, status: 'active', plan: sub.plan, current_period_end: sub.current_period_end });
      }
      return res.status(200).json({ ok: true, status: sub.status });
    } catch(e) {
      return res.status(500).json({
        ok: false,
        error: e.message,
        code: 'STRIPE_INTERNAL',
      });
    }
  }

  // ── WEBHOOK DE STRIPE ──
  if (action === 'webhook') {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody || body, sig, webhookSecret);
    } catch(e) {
      return res.status(400).json({
        ok: false,
        error: `Webhook error: ${e.message}`,
        code: 'STRIPE_BAD_REQUEST',
      });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      const plan   = session.metadata?.plan;
      const subId  = session.subscription;
      if (userId && subId) {
        const stripeSub = await stripe.subscriptions.retrieve(subId);
        const periodEnd = new Date(stripeSub.current_period_end * 1000).toISOString();
        await fetch(`${SB_URL}/rest/v1/subscriptions?user_id=eq.${userId}`, {
          method: 'PATCH',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'active', plan, stripe_subscription_id: subId, current_period_end: periodEnd })
        });
      }
    }

    if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.paused') {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id;
      if (userId) {
        await fetch(`${SB_URL}/rest/v1/subscriptions?user_id=eq.${userId}`, {
          method: 'PATCH',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled' })
        });
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      const subId = invoice.subscription;
      if (subId) {
        const stripeSub = await stripe.subscriptions.retrieve(subId);
        const userId = stripeSub.metadata?.user_id;
        if (userId) {
          await fetch(`${SB_URL}/rest/v1/subscriptions?user_id=eq.${userId}`, {
            method: 'PATCH',
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'payment_failed' })
          });
        }
      }
    }

    return res.status(200).json({ ok: true, received: true });
  }

  return res.status(400).json({
    ok: false,
    error: 'Acción no reconocida',
    code: 'STRIPE_UNKNOWN_ACTION',
  });
}
