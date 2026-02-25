# Model Run Codes

## What Are Model Run Codes?

This project uses the **HRDPS (High Resolution Deterministic Prediction System)** weather model from Environment Canada. The model runs **4 times per day**, and each run is identified by the UTC hour it was initialized.

The "Z" suffix stands for **Zulu time**, the military/aviation term for UTC (Coordinated Universal Time).

## Run Times and Pacific Time Equivalents

| Model Run | UTC Time     | PST (UTC-8)            | PDT (UTC-7)            |
|-----------|-------------|------------------------|------------------------|
| **00Z**   | 12:00 AM UTC | 4:00 PM previous day  | 5:00 PM previous day  |
| **06Z**   | 6:00 AM UTC  | 10:00 PM previous day | 11:00 PM previous day |
| **12Z**   | 12:00 PM UTC | 4:00 AM same day      | 5:00 AM same day      |
| **18Z**   | 6:00 PM UTC  | 10:00 AM same day     | 11:00 AM same day     |

> **Example:** "Model Run: 18Z" on February 25 means the model was initialized at 6:00 PM UTC, which is 10:00 AM PST (or 11:00 AM PDT during daylight saving time).

## Data Availability

Model output is not available immediately after initialization — it takes approximately 5 hours to process. The table below shows when each run's data typically becomes available:

| Model Run | Available At (UTC) | Available At (PST) | Available At (PDT) |
|-----------|--------------------|--------------------|--------------------|
| **00Z**   | ~05:00 UTC         | ~9:00 PM prev day  | ~10:00 PM prev day |
| **06Z**   | ~11:00 UTC         | ~3:00 AM           | ~4:00 AM           |
| **12Z**   | ~17:00 UTC         | ~9:00 AM           | ~10:00 AM          |
| **18Z**   | ~23:00 UTC         | ~3:00 PM           | ~4:00 PM           |

## Scheduled Fetch Times

The application's Cloud Scheduler fetches new forecast data 4 times per day, timed to align with when each model run becomes available:

| Fetch Time (Pacific) | Picks Up Run |
|----------------------|-------------|
| 4:00 AM              | 00Z         |
| 10:00 AM             | 06Z         |
| 4:00 PM              | 12Z         |
| 10:00 PM             | 18Z         |

## How the Latest Run Is Selected

The `detectLatestModelRun()` function (in `functions/index.js` and `api/forecast.php`) automatically selects the most recent available model run based on the current UTC hour:

| Current UTC Hour | Selected Run |
|-----------------|-------------|
| 0–4             | 18Z (previous day) |
| 5–10            | 00Z         |
| 11–16           | 06Z         |
| 17–22           | 12Z         |
| 23              | 18Z         |

## In the UI

The current model run is displayed as a small label (e.g., **"Model Run: 18Z"**) beneath the forecast header, so users know which forecast cycle the data comes from.
