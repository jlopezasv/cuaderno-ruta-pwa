export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
      code: "PUSH_METHOD_NOT_ALLOWED",
    });
  }

  try {
    const { action, payload } = req.body || {};

    if (!action) {
      return res.status(400).json({
        ok: false,
        error: "Missing action",
        code: "PUSH_BAD_REQUEST",
      });
    }

    if (action === "vapid_key") {
      const publicKey = process.env.VAPID_PUBLIC_KEY;
      if (!publicKey) {
        return res.status(503).json({
          ok: false,
          error: "VAPID public key not configured",
          code: "PUSH_NOT_CONFIGURED",
        });
      }
      return res.status(200).json({ ok: true, publicKey });
    }

    if (action === "subscribe") {
      const userId = payload?.user_id;
      const subscription = payload?.subscription;
      if (!userId || !subscription) {
        return res.status(400).json({
          ok: false,
          error: "Invalid subscribe payload",
          code: "PUSH_BAD_REQUEST",
        });
      }
      return res.status(200).json({ ok: true });
    }

    if (action === "schedule") {
      const userId = payload?.user_id;
      const fireAt = payload?.fire_at;
      const title = payload?.title;
      const body = payload?.body;
      const tag = payload?.tag;
      if (!userId || !fireAt || !title || !body || !tag) {
        return res.status(400).json({
          ok: false,
          error: "Invalid schedule payload",
          code: "PUSH_BAD_REQUEST",
        });
      }
      return res.status(200).json({
        ok: true,
        accepted: true,
        mode: "noop",
      });
    }

    if (action === "cancel") {
      const userId = payload?.user_id;
      const tag = payload?.tag;
      if (!userId || !tag) {
        return res.status(400).json({
          ok: false,
          error: "Invalid cancel payload",
          code: "PUSH_BAD_REQUEST",
        });
      }
      return res.status(200).json({
        ok: true,
        accepted: true,
        mode: "noop",
      });
    }

    return res.status(501).json({
      ok: false,
      error: `Action not implemented: ${action}`,
      code: "NOT_IMPLEMENTED",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Internal server error",
      code: "PUSH_INTERNAL",
    });
  }
}
