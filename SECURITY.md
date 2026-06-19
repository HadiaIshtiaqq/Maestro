# Security

Maestro is a **hackathon demo** oriented toward Track 3 (regulated workflows). It implements real governance patterns, but it is not a production security product without further hardening.

## Secrets

- **Never commit** API keys, `JWT_SECRET`, or `OPERATOR_API_KEY` to git. Use [`.env.example`](.env.example) as a template only.
- **Production requires** `JWT_SECRET` and `OPERATOR_API_KEY` — the server refuses to boot without them.
- **Do not bake** `OPERATOR_API_KEY` into the frontend bundle. The operator dashboard prompts for it at runtime and stores it in `localStorage` on the operator's machine.
- **Rotate** all secrets if they were ever shared in docs, chat, or screen recordings.

## Operator access

Privileged actions require the `x-operator-key` header matching `OPERATOR_API_KEY`:

- Approve / veto (`POST /api/band/approve`, `/api/band/veto`)
- Operator takeover, resolve, escalate, notes, bulk-close
- Demo admin (`POST /api/admin/reset-demo`)
- Incident verify / retract, dispatch log, simulate scenarios
- Compliance audit export (`GET /api/band/audit-trail/:incidentId`)

On first use, the web UI prompts for the operator key. For `curl`, pass:

```bash
curl -H "x-operator-key: $OPERATOR_API_KEY" ...
```

In **development**, if `OPERATOR_API_KEY` is unset, operator routes are open with a one-time console warning.

## Real-time connections

In **production**, Socket.IO connections require either:

- the operator key in the handshake (`auth.operatorKey`), or
- a valid mobile-user JWT (`auth.token`)

## Public endpoints

Signal intake (`POST /api/ingest-signal`) remains rate-limited but unauthenticated so citizen/mobile reporting works. Read-only incident listing is public for the operator dashboard demo.

## Reporting issues

If you discover a security issue in this repository, please report it privately to the repository owner rather than opening a public issue with exploit details.
