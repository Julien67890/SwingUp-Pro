/* =========================================================================
   SwingUp Pro — Cloud Functions (abonnement Stripe)
   =========================================================================
   Trois endpoints HTTPS, région europe-west1 (comme les autres apps) :

     - createCheckoutSession  : ouvre une session Stripe Checkout
                                 (essai gratuit de 7 jours, puis 4,90€/mois).
     - createPortalLink       : ouvre le portail Stripe (gérer / résilier).
     - stripeWebhook          : reçoit les événements Stripe et écrit le
                                 statut d'abonnement dans Firestore, au
                                 EXACT même format que Télémètre et Carte de
                                 score savent déjà lire :
                                 users/{uid}/billing/status
                                   { status, plan, currentPeriodEnd,
                                     stripeSubscriptionId }

   Pas de palier gratuit : en dehors de l'essai (statut Stripe "trialing")
   et de l'abonnement actif ("active"), le statut retombe à "free" et
   isPremium() dans les 2 apps — donc l'accès au shell — se referme.

   ------------------------------------------------------------------------
   Mise en route (voir aussi README.md à la racine du projet) :

     firebase functions:secrets:set STRIPE_SECRET_KEY
     firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
     firebase functions:config:set stripe.price_id="price_xxx" stripe.allowed_origin="https://julien67890.github.io"
       (ou éditer les constantes PRICE_ID / ALLOWED_ORIGIN ci-dessous)

     firebase deploy --only functions
   ========================================================================= */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const cors = require('cors');

admin.initializeApp();
const db = admin.firestore();

/* =========================================================================
   ▼▼▼  A REMPLIR  ▼▼▼
   ========================================================================= */
/* Identifiant du prix Stripe "SwingUp Pro — 4,90€/mois" (Stripe Dashboard
   → Produits → SwingUp Pro → copier l'ID du prix, commence par "price_"). */
const PRICE_ID = 'prod_V64AUdm74R67Yt';
/* Domaine(s) autorisé(s) à appeler ces fonctions (CORS). Mets ici l'URL
   exacte où SwingUp Pro sera servie. */
const ALLOWED_ORIGINS = [
  'https://julien67890.github.io',
  'http://localhost:8877' /* pratique pour tester en local, à retirer en prod si tu veux verrouiller davantage */
];
/* Durée de l'essai gratuit, en jours. */
const TRIAL_DAYS = 7;
const REGION = 'europe-west1';
/* =========================================================================
   ▲▲▲  FIN A REMPLIR  ▲▲▲
   ========================================================================= */

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

const corsHandler = cors({ origin: ALLOWED_ORIGINS });

function getStripe(secretKey) {
  return new Stripe(secretKey, { apiVersion: '2024-06-20' });
}

/* Vérifie le token Firebase envoyé en "Authorization: Bearer <idToken>". */
async function requireUser(req) {
  const header = req.get('Authorization') || '';
  const m = header.match(/^Bearer (.+)$/);
  if (!m) throw new Error('missing_token');
  const decoded = await admin.auth().verifyIdToken(m[1]);
  return decoded; // decoded.uid, decoded.email
}

/* Retrouve (ou crée) le client Stripe associé à cet utilisateur. */
async function getOrCreateStripeCustomer(stripe, uid, email) {
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  const existing = snap.exists ? snap.data().stripeCustomerId : null;
  if (existing) return existing;

  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { uid }
  });
  await userRef.set({ stripeCustomerId: customer.id }, { merge: true });
  await db.collection('stripeCustomers').doc(customer.id).set({ uid });
  return customer.id;
}

/* =========================================================================
   createCheckoutSession
   ========================================================================= */
exports.createCheckoutSession = onRequest(
  { region: REGION, secrets: [STRIPE_SECRET_KEY] },
  (req, res) => {
    corsHandler(req, res, async () => {
      if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
      if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
      try {
        const user = await requireUser(req);
        if (PRICE_ID === 'A_REMPLIR') {
          res.status(500).json({ error: 'not_configured', message: 'PRICE_ID non configuré dans functions/index.js' });
          return;
        }
        const stripe = getStripe(STRIPE_SECRET_KEY.value());
        const customerId = await getOrCreateStripeCustomer(stripe, user.uid, user.email);
        const returnUrl = (req.body && req.body.returnUrl) || ALLOWED_ORIGINS[0];

        /* Un utilisateur ne bénéficie de l'essai gratuit qu'une seule fois :
           s'il a déjà eu un abonnement Stripe par le passé, pas de nouvel essai. */
        const existingSubs = await stripe.subscriptions.list({ customer: customerId, limit: 1, status: 'all' });
        const alreadyUsedTrial = existingSubs.data.length > 0;

        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          customer: customerId,
          client_reference_id: user.uid,
          line_items: [{ price: PRICE_ID, quantity: 1 }],
          subscription_data: alreadyUsedTrial ? {} : { trial_period_days: TRIAL_DAYS },
          allow_promotion_codes: true,
          success_url: returnUrl + (returnUrl.includes('?') ? '&' : '?') + 'checkout=success',
          cancel_url: returnUrl + (returnUrl.includes('?') ? '&' : '?') + 'checkout=cancel'
        });

        res.status(200).json({ url: session.url });
      } catch (err) {
        logger.error('createCheckoutSession failed', err);
        const code = err.message === 'missing_token' ? 401 : 500;
        res.status(code).json({ error: 'checkout_failed' });
      }
    });
  }
);

/* =========================================================================
   createPortalLink
   ========================================================================= */
exports.createPortalLink = onRequest(
  { region: REGION, secrets: [STRIPE_SECRET_KEY] },
  (req, res) => {
    corsHandler(req, res, async () => {
      if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
      if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
      try {
        const user = await requireUser(req);
        const stripe = getStripe(STRIPE_SECRET_KEY.value());
        const snap = await db.collection('users').doc(user.uid).get();
        const customerId = snap.exists ? snap.data().stripeCustomerId : null;
        if (!customerId) { res.status(404).json({ error: 'no_customer' }); return; }
        const returnUrl = (req.body && req.body.returnUrl) || ALLOWED_ORIGINS[0];

        const portal = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: returnUrl
        });
        res.status(200).json({ url: portal.url });
      } catch (err) {
        logger.error('createPortalLink failed', err);
        const code = err.message === 'missing_token' ? 401 : 500;
        res.status(code).json({ error: 'portal_failed' });
      }
    });
  }
);

/* =========================================================================
   stripeWebhook — écrit users/{uid}/billing/status
   ========================================================================= */
exports.stripeWebhook = onRequest(
  { region: REGION, secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const stripe = getStripe(STRIPE_SECRET_KEY.value());
    let event;
    try {
      const sig = req.get('stripe-signature');
      event = stripe.webhooks.constructEvent(req.rawBody, sig, STRIPE_WEBHOOK_SECRET.value());
    } catch (err) {
      logger.error('Signature webhook invalide', err);
      res.status(400).send('signature invalide');
      return;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          if (session.mode === 'subscription' && session.subscription) {
            const sub = await stripe.subscriptions.retrieve(session.subscription);
            await writeBillingFromSubscription(sub, session.client_reference_id);
          }
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const sub = event.data.object;
          await writeBillingFromSubscription(sub, await uidForCustomer(sub.customer));
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          const uid = await uidForCustomer(sub.customer);
          if (uid) {
            await db.collection('users').doc(uid).collection('billing').doc('status').set({
              status: 'free',
              plan: null,
              currentPeriodEnd: null,
              stripeSubscriptionId: sub.id
            }, { merge: true });
          }
          break;
        }
        default:
          break; /* les autres événements ne concernent pas le statut d'accès */
      }
      res.status(200).send('ok');
    } catch (err) {
      logger.error('Traitement webhook échoué', err);
      res.status(500).send('erreur interne');
    }
  }
);

async function uidForCustomer(customerId) {
  const snap = await db.collection('stripeCustomers').doc(customerId).get();
  if (snap.exists) return snap.data().uid;
  /* Filet de sécurité si le mapping Firestore manque : relire les métadonnées Stripe. */
  try {
    const stripe = getStripe(STRIPE_SECRET_KEY.value());
    const customer = await stripe.customers.retrieve(customerId);
    return customer && customer.metadata ? customer.metadata.uid : null;
  } catch (e) {
    return null;
  }
}

async function writeBillingFromSubscription(sub, uid) {
  if (!uid) { logger.warn('Abonnement Stripe sans uid associé', sub.id); return; }
  await db.collection('users').doc(uid).collection('billing').doc('status').set({
    status: sub.status, /* 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' ... */
    plan: 'monthly',
    currentPeriodEnd: sub.current_period_end ? sub.current_period_end * 1000 : null,
    stripeSubscriptionId: sub.id
  }, { merge: true });
}
