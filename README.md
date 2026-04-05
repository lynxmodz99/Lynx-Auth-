# LynxAuth — Open Source Release

> **Note:** This is not the actual LynxAuth source code.
> This is a simplified frontend + basic auth logic released publicly to show how HWID locking works at a surface level.
> Our real product is built differently and is far more powerful.

---

## What is this?

This is the **official open-source frontend** of LynxAuth, released temporarily while the full product is in active development.

It includes:
- A basic HWID check example (simplified, not production-grade)
- A frontend dashboard UI
- A simple Python backend to show the concept

**This will remain the "official public version" until March 2026**, after which the full product launch is expected.

---

## How HWID locking actually works (simple explanation)

HWID stands for **Hardware ID**. It's basically a fingerprint of the computer someone is using.

Here's the idea, step by step:

1. **User installs your software** — when they first activate it with a license key, your app reads some info from their machine (drive serial number, CPU info, etc.) and generates a unique hardware fingerprint.

2. **That fingerprint gets saved** — the server stores this HWID against the user's license key.

3. **Every time they launch the app** — the app sends the key + current HWID to the server. If it matches, they get access. If they try to use the same key on a different PC, it gets blocked.

4. **The admin can reset HWIDs** — if someone gets a new PC or reinstalls, the admin can wipe the HWID so they can re-bind on their new machine.

This prevents key sharing. One key = one machine. That's the whole point.

> The actual LynxAuth API does this in a much more robust way — with multi-factor hardware checks, IP tracking, session management, and real-time webhook alerts. This open-source version only shows the basic idea.

---

## What's NOT included here

- The real admin panel
- Subscription / tier management system
- Advanced multi-factor HWID logic
- IP + device fingerprint tracking
- Production-grade API structure
- Ban system with audit logs
- Webhook & monitoring integrations

---

## Want the full source?

Contact the developer:

- **Discord:** lynx.x99
- **Website:** [Lynx Auth](https://lynxauth.qzz.io/)
- **About Owner** [Lynx modz](https://lynxmodz.qzz.io/)
- **Support** [Lynx regedit](https://discord.gg/Vx43JXddFD)

---

> **Disclaimer:** This license applies only to the open-source release found in this repository.
> The full LynxAuth product, its API, admin panel, and related systems are proprietary and NOT covered under this license.
> Unauthorized redistribution of the full source code is prohibited.
