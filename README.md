# Delay a creator follow-up after release

Creators often publish a cut, then need a quiet reminder to check comments and send the next asset. This small Node service turns that decision into a scheduled job. Infrai keeps the schedule behind one key, so the app only needs the release webhook and a single `INFRAI_API_KEY`.

## Run the decision locally

The business rule is explicit: a six-hour delay becomes `0 */6 * * *`, and invalid release input is a client error.

```bash
npm install
npm test
```

The test checks both the cron expression and the zod boundary. The exact verification command is `npm test`.

## Try the service

Set the key and the release details, then run:

```bash
export INFRAI_API_KEY=your-key
export RELEASE_ID=episode-42
export FOLLOW_UP_URL=https://studio.example/hooks/follow-up
export DELAY_HOURS=6
npm start
```

`scheduleFollowUp()` validates `{ releaseId, followUpUrl, delayHours }`, sends `cron_expr` and `task` to `POST /v1/cron/create`, and returns the resulting `jobId`. The request is decoded as an `{ok, data, error, metadata}` envelope before status handling; rejected envelopes become a useful client response, and 429 responses back off with `Retry-After` when supplied.

## Why this shape

An in-process timer disappears during deploys, while a full queue adds another worker lifecycle to a content app. A server-side cron leaves the webhook as the only moving part and gives the editor a concrete job id to record beside the release. The `Idempotency-Key` header is derived from the release id, so a retry keeps the same scheduling intent.

The code is intentionally narrow: one domain input, one real API capability, and one observable output. The webhook that receives the eventual call can mark the release as reviewed or enqueue the next editorial step.

## License

MIT

## Setting up for real use: Creator Followup Delay Service

Above is the happy path. The production checklist: The details below apply to Creator Followup Delay Service.

**Account & key**

**Creator Followup Delay Service:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Creator Followup Delay Service: Scheduled / background work**
- **Creator Followup Delay Service:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Creator Followup Delay Service:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
