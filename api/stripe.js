import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerEnv } from './_lib/supabaseEnv.js';
import { guardDemoCannotUseProduction } from './_lib/demoSafety.js';

const PRICE_MONTHLY = 'price_1TNpMxC03Kg4wBdS3eqhhVsg';
const PRICE_ANNUAL  = 'price_1TNpNyC03Kg4wBdSHfAUkSeB';
const APP_URL       = 'https://tacografo-pro.vercel.app';

function sbServer() {
  return getSupabaseServerEnv();
}

function resolveServiceKey() {
  const key = sbServer().serviceRoleKey;
  if (!key) {
    throw new Error('[Cuaderno API] SUPABASE_SERVICE_ROLE_KEY no definida (Stripe requiere service role).');
  }
  return key;
}

/**
 * service_role bypassa RLS: cualquier acción REST con service key debe ir precedida
 * de comprobar que el Bearer es del mismo usuario que se va a leer/escribir.
 */
async function getUserIdFromAuthorizationHeader(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization || '';
  const m = String(raw).match(/^Bearer\s+(.+)$/i);
  if (!m) return { userId: null, error: 'missing_authorization_bearer' };
  const jwt = m[1].trim();
  let anon;
  let url;
  try {
    const env = sbServer();
    anon = env.anonKey;
    url = env.url;
  } catch (e) {
    return { userId: null, error: 'supabase_not_configured' };
  }
  guardDemoCannotUseProduction(url, 'stripe:getUserFromBearer');
  const sb = createClient(url, anon);
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data?.user?.id) return { userId: null, error: error?.message || 'invalid_bearer' };
  return { userId: data.user.id, error: null };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
      code: 'STRIPE_METHOD_NOT_ALLOWED',
    });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const SERVICE_KEY = resolveServiceKey();

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
    const auth = await getUserIdFromAuthorizationHeader(req);
    if (!auth.userId) {
      return res.status(401).json({
        ok: false,
        error: auth.error || 'No autorizado',
        code: 'STRIPE_UNAUTHORIZED',
      });
    }
    if (!email || !plan) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan datos',
        code: 'STRIPE_BAD_REQUEST',
      });
    }
    if (user_id && user_id !== auth.userId) {
      return res.status(403).json({
        ok: false,
        error: 'user_id no coincide con la sesión',
        code: 'STRIPE_FORBIDDEN',
      });
    }
    const uid = auth.userId;
    const priceId = plan === 'annual' ? PRICE_ANNUAL : PRICE_MONTHLY;
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer_email: email,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${APP_URL}?pago=ok&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${APP_URL}?pago=cancelado`,
        metadata: { user_id: uid, plan },
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
    const auth = await getUserIdFromAuthorizationHeader(req);
    if (!auth.userId) {
      return res.status(401).json({
        ok: false,
        error: auth.error || 'No autorizado',
        code: 'STRIPE_UNAUTHORIZED',
      });
    }
    if (user_id && user_id !== auth.userId) {
      return res.status(403).json({
        ok: false,
        error: 'user_id no coincide con la sesión',
        code: 'STRIPE_FORBIDDEN',
      });
    }
    const uid = auth.userId;
    if (!SERVICE_KEY) {
      return res.status(503).json({
        ok: false,
        error: 'SUPABASE_SERVICE_ROLE_KEY no configurada',
        code: 'STRIPE_NOT_CONFIGURED',
      });
    }
    try {
      const r = await fetch(`${sbServer().url}/rest/v1/subscriptions?user_id=eq.${uid}`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      const rows = await r.json();
      if (!rows.length) {
        // Primera vez — crear trial de 14 días
        const trialEnd = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
        await fetch(`${sbServer().url}/rest/v1/subscriptions`, {
          method: 'POST',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ user_id: uid, plan: 'trial', status: 'trial', trial_ends_at: trialEnd })
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
    if (!SERVICE_KEY) {
      return res.status(503).json({
        ok: false,
        error: 'SUPABASE_SERVICE_ROLE_KEY no configurada',
        code: 'STRIPE_NOT_CONFIGURED',
      });
    }
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
        await fetch(`${sbServer().url}/rest/v1/subscriptions?user_id=eq.${userId}`, {
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
        await fetch(`${sbServer().url}/rest/v1/subscriptions?user_id=eq.${userId}`, {
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
          await fetch(`${sbServer().url}/rest/v1/subscriptions?user_id=eq.${userId}`, {
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
