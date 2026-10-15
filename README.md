# AI API Monitor

A backend service that monitors API responses, detects anomalies, stores them in a database, and generates human-readable alerts with an LLM (Groq or OpenAI). If no key is configured or the model is unavailable, it falls back to a rule-based message.

## Features

- Single or batch input through `POST /monitor`
- Anomaly detection: high response time, 4xx/5xx status codes, missing or zero records
- AI-generated alert text (Groq or OpenAI), with fallback
- SQLite storage (`alerts.db`), created automatically
- Alerts resolve automatically when an API stops showing the issue (or manually from the dashboard)
- `GET /alerts` returns all active anomalies
- Web dashboard at `/` that refreshes every 10 seconds, groups alerts by API, and lets you resolve them
- Input validation, error handling, and file logging (`logs/app.log`)

## Project structure

```
src/
  server.js     Express routes and request handling
  detector.js   Anomaly rules (pure functions)
  llm.js        LLM alert generation with fallback
  db.js         SQLite schema and queries
  validator.js  Input validation
  logger.js     Console and file logging
  config.js     Thresholds and settings
public/
  index.html    Alert dashboard
sample/
  input.json    Example batch input
```

## Setup

Requirements: Node.js 18 or newer. `better-sqlite3` builds a native module, so on Linux you may need `build-essential` and `python3`.

```bash
npm install
cp .env.example .env
```

Then choose an LLM in `.env`:

- **Groq:** `LLM_PROVIDER=groq`, set `GROQ_API_KEY` (and optionally `GROQ_MODEL`, default `llama-3.3-70b-versatile`).
- **OpenAI:** `LLM_PROVIDER=openai`, set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`).
- **No AI:** `LLM_PROVIDER=none`, or leave the key empty. Alerts use the rule-based fallback text.

## Run

```bash
npm start
```

Open `http://localhost:3000` for the dashboard.

## Test

Send the sample batch:

```bash
curl -X POST http://localhost:3000/monitor \
  -H "Content-Type: application/json" \
  -d @sample/input.json
```

Single object:

```bash
curl -X POST http://localhost:3000/monitor \
  -H "Content-Type: application/json" \
  -d '{"api_name":"AppointmentAPI","response_time_ms":5500,"status_code":500,"records_returned":0}'
```

View active alerts:

```bash
curl http://localhost:3000/alerts
```

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/monitor` | Analyse one API record or an array of records |
| GET | `/alerts` | List all active anomalies, newest first |
| POST | `/alerts/:id/resolve` | Mark an alert as resolved |
| GET | `/health` | Simple health check |

### Input fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `api_name` | string | yes | Name of the API being monitored |
| `response_time_ms` | number | no | Compared against 3000 ms (warning) and 5000 ms (critical) |
| `status_code` | number | no | 5xx is critical, 4xx is a warning |
| `records_returned` | number or null | no | Missing, null, or 0 is flagged |

### Response from POST /monitor

```json
{
  "processed": 4,
  "stored_alerts": 5,
  "updated_alerts": 0,
  "resolved_alerts": 0,
  "results": [
    { "api_name": "PatientDataAPI", "status": "healthy", "anomalies": 0 },
    { "api_name": "AppointmentAPI", "status": "anomaly", "anomalies": 3 }
  ]
}
```

## Anomaly rules

| Condition | Type | Severity |
|-----------|------|----------|
| response_time_ms > 3000 | HIGH_RESPONSE_TIME | warning |
| response_time_ms > 5000 | HIGH_RESPONSE_TIME | critical |
| status_code >= 500 | SERVER_ERROR | critical |
| status_code 400 to 499 | CLIENT_ERROR | warning |
| records_returned missing, null, or 0 | NO_RECORDS | warning |

Thresholds live in `src/config.js`.

## Architecture

1. Input arrives at `POST /monitor` as one object or a batch.
2. Each record is validated. Invalid records are reported and skipped, and the rest of the batch continues.
3. The detector applies the rules above and returns zero or more anomalies.
4. For each record with anomalies, one LLM call produces a single readable message, shared by that record's anomalies. If the call fails or no key is set, a rule-based message is used.
5. All anomalies from the batch are saved in one database transaction. If an active alert already exists for the same API and issue type, it is refreshed with the latest data instead of duplicated.
6. The dashboard and `GET /alerts` read active anomalies from the database.

Design choices:
- Detection is separate from alert text, so the rules stay deterministic and testable even if the LLM is down.
- One LLM call per API record, not per anomaly, to limit cost and latency.
- The fallback ensures an alert is never lost because of an external failure.
- SQLite keeps setup simple. The storage layer can move to Postgres or MongoDB without changing the detector.

## Switching LLM providers

The provider is chosen in `.env` with `LLM_PROVIDER`. To add another OpenAI-compatible provider, add an entry to `PROVIDERS` in `src/llm.js` with its URL, key variable, and model variable. The detector, storage, and API code do not change.

## Logs

Logs print to the console and are appended to `logs/app.log`.

## Known limitations

- No authentication on the endpoints. Add it before any production use.
- Resolved alerts are hidden from the dashboard but kept in the database. There is no history view yet.
- Email reporting is not implemented (it is optional in the brief).


## Result

https://github.com/user-attachments/assets/bc71da3a-ded9-4a0b-b33b-4955d9ae825b

