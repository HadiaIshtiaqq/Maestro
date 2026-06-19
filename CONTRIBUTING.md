# Contributing

Thanks for your interest in Maestro. This project was built for the **Band of Agents Hackathon** (lablab.ai, Track 3) and is maintained as a public demo/reference implementation.

## Development setup

```bash
npm install
cp .env.example .env    # fill in GEMINI_API_KEY, MONGODB_URI, OPERATOR_API_KEY, JWT_SECRET
npm run dev             # http://localhost:3000
```

## Before opening a PR

```bash
npm run lint
npm test
npm run build
```

All three must pass. CI enforces the same checks on `main`.

## Code conventions

- Match existing TypeScript style; backend uses **strict** mode.
- Add **Zod validation** for new `POST`/`PUT` API bodies in [`src/lib/validationSchemas.ts`](src/lib/validationSchemas.ts).
- Privileged routes must use the `operatorAuth` middleware.
- Do not commit secrets or add `VITE_*` vars for server-only credentials.
- Prefer extending `IBandAdapter` over coupling agent logic to Band SDK details.

## Scope

- **In scope:** operator dashboard, Band-coordinated agent pipeline, governance/audit.
- **Out of scope for Track 3:** the Expo mobile app (`mobile/`) — changes welcome but not required for core demos.

## Security

See [SECURITY.md](SECURITY.md) before reporting or fixing auth issues.
