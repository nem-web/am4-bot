# AM4 Bot — Airline Manager 4 Automation Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Actions](https://img.shields.io/badge/Runs%20on-GitHub%20Actions-blue?logo=github)](../../actions)

> An automated bot for [Airline Manager 4](https://airlinemanager.com) that tracks **fuel prices**, **CO₂ prices**, and **auto-departs landed aircraft** — running on a schedule via GitHub Actions and sending real-time notifications to **Telegram**.

---

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Setup Guide](#setup-guide)
  - [1. Fork the Repository](#1-fork-the-repository)
  - [2. Get Your Telegram Bot Token](#2-get-your-telegram-bot-token)
  - [3. Get Your Telegram Chat ID](#3-get-your-telegram-chat-id)
  - [4. Get Your AM4 Login String](#4-get-your-am4-login-string)
  - [5. Add GitHub Secrets](#5-add-github-secrets)
  - [6. Enable GitHub Actions](#6-enable-github-actions)
- [Configuration](#configuration)
- [Schedule](#schedule)
- [Telegram Notifications](#telegram-notifications)
- [Project Structure](#project-structure)
- [Disclaimer](#disclaimer)
- [License](#license)
- [Contact](#contact)

---

## Features

| Feature | Description |
|---|---|
| ✈️ Auto-Depart | Detects all landed aircraft and departs them automatically |
| ⛽ Fuel Tracking | Monitors fuel price and buys when it drops below your threshold |
| 🌱 CO₂ Tracking | Monitors CO₂ price and buys when it drops below your threshold |
| 💰 Cash Alert | Notifies you when your in-game cash exceeds a set limit |
| 📲 Telegram Alerts | Sends real-time notifications for every action taken |
| ⏱️ Scheduled Runs | Runs automatically every 15 minutes via GitHub Actions |

---

## How It Works

1. The bot launches a headless Chromium browser using [Puppeteer](https://pptr.dev/).
2. It logs into Airline Manager 4 using your login URL.
3. It performs the following tasks in order:
   - **Auto-Depart**: Scans your routes page for all aircraft IDs and triggers a bulk depart.
   - **Cash Check**: Visits the banking page and alerts you if your cash exceeds `$5,000,000`.
   - **Fuel Check**: Reads the current fuel price. If it is at or below `$450 per 1,000 units`, it purchases `200,000 units` automatically.
   - **CO₂ Check**: Reads the current CO₂ price. If it is at or below `$115 per 1,000 units`, it purchases `200,000 units` automatically.
4. All results and alerts are sent to your Telegram chat.

---

## Prerequisites

- A [GitHub](https://github.com) account
- An [Airline Manager 4](https://airlinemanager.com) account
- A [Telegram](https://telegram.org) account

No local installation is required — everything runs in the cloud via **GitHub Actions**.

---

## Setup Guide

### 1. Fork the Repository

Click the **Fork** button at the top right of this page to create your own copy of the repository.

---

### 2. Get Your Telegram Bot Token

1. Open Telegram and search for **[@BotFather](https://t.me/BotFather)**.
2. Start a chat and send the command `/newbot`.
3. Follow the prompts: choose a name and a username for your bot.
4. BotFather will respond with a **token** that looks like:
   ```
   123456789:ABCDEFghijklmnopQRSTuvwxyz
   ```
5. Copy and save this token — this is your `TELEGRAM_TOKEN`.

---

### 3. Get Your Telegram Chat ID

**Option A — Using @userinfobot (easiest):**
1. Open Telegram and search for **[@userinfobot](https://t.me/userinfobot)**.
2. Start a chat and send `/start`.
3. The bot will reply with your **ID** — this is your `CHAT_ID`.

**Option B — Using the Telegram API:**
1. Send any message to your newly created bot.
2. Open the following URL in your browser (replace `<YOUR_TOKEN>` with your token):
   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```
3. Find the `"id"` field inside `"chat"` in the JSON response — this is your `CHAT_ID`.

> **Note:** If you want the bot to notify a group, add the bot to the group and use the group's chat ID (which will be a negative number starting with `-`).

---

### 4. Get Your AM4 Login String

The **login string** is a special direct-access URL that logs you into Airline Manager 4 automatically (bypassing the normal sign-in page). It is unique to your account.

**How to find it:**
1. Log into [Airline Manager 4](https://airlinemanager.com) on a desktop browser.
2. Navigate to **Help** (usually found in the game's side menu or top navigation).
3. Look for a section labeled **"Login String"**, **"Direct Login URL"**, or similar.
4. Copy the full URL — it typically looks like:
   ```
   https://airlinemanager.com/...?authToken=XXXX...
   ```
5. This is your `LOGIN_URL`.

> ⚠️ **Keep this URL private.** Anyone with this URL can access your AM4 account. Never share it publicly.

> 💡 If you cannot find the login string, contact support at **user.digitech94@gmail.com** for further assistance.

---

### 5. Add GitHub Secrets

Your credentials must be stored as **encrypted GitHub Secrets** so they are never exposed in your code.

1. Go to your forked repository on GitHub.
2. Click **Settings** → **Secrets and variables** → **Actions**.
3. Click **New repository secret** and add each of the following:

| Secret Name | Description | Example |
|---|---|---|
| `TELEGRAM_TOKEN` | Your Telegram bot token from BotFather | `123456789:ABCDEFg...` |
| `CHAT_ID` | Your Telegram chat ID | `987654321` |
| `LOGIN_URL` | Your AM4 direct login URL | `https://airlinemanager.com/...` |

---

### 6. Enable GitHub Actions

1. Go to the **Actions** tab in your forked repository.
2. If prompted, click **"I understand my workflows, go ahead and enable them"**.
3. The bot will now run automatically every 10 minutes.
4. You can also trigger it manually by clicking **Run workflow** in the Actions tab.

---

## Configuration

You can adjust the bot's thresholds and limits by editing the settings at the top of [`script.js`](script.js):

```js
// ===== SETTINGS =====
const fuelThreshold = 450;    // Buy fuel when price drops at or below $450/1000
const co2Threshold  = 115;    // Buy CO2  when price drops at or below $115/1000
const maxAmount     = 200000; // Amount of fuel/CO2 to purchase per trigger
const cashAlertLimit = 5000000; // Alert if cash exceeds this amount
```

| Setting | Default | Description |
|---|---|---|
| `fuelThreshold` | `450` | Maximum fuel price (per 1,000 units) to trigger a purchase |
| `co2Threshold` | `115` | Maximum CO₂ price (per 1,000 units) to trigger a purchase |
| `maxAmount` | `200,000` | Number of units to purchase when price is low |
| `cashAlertLimit` | `5,000,000` | Send a cash alert if balance exceeds this value |

---

## Schedule

The bot runs on a **cron schedule** defined in [`.github/workflows/bot.yml`](.github/workflows/bot.yml):

```yaml
schedule:
  - cron: "*/10 * * * *"   # Every 10 minutes
```

You can change this to any valid cron expression. For example:
- `"*/30 * * * *"` — every 30 minutes
- `"0 * * * *"` — every hour

---

## Telegram Notifications

The bot sends the following messages to your Telegram chat:

| Message | Meaning |
|---|---|
| 🚀 Bot Started | Bot successfully logged into AM4 |
| ✈️ Depart completed | All aircraft were successfully departed |
| ⚠️ No aircraft departed | Depart request was sent but nothing was ready |
| ⚠️ No aircraft found | No aircraft were found on the routes page |
| 💰 Cash Alert: $X | Your cash balance exceeds the alert limit |
| ⛽ Fuel Price (per 1000): $X | Current fuel price notification |
| ✅ FUEL BOUGHT | Fuel was purchased successfully (with details) |
| ❌ Fuel price not detected | Could not read the fuel price from the page |
| 🌱 CO2 Price (per 1000): $X | Current CO₂ price notification |
| ✅ CO2 BOUGHT | CO₂ was purchased successfully (with details) |
| ❌ CO2 price not detected | Could not read the CO₂ price from the page |
| ❌ ERROR: ... | An unexpected error occurred |

---

## Project Structure

```
am4-bot/
├── .github/
│   └── workflows/
│       └── bot.yml       # GitHub Actions workflow (runs on schedule)
├── script.js             # Main bot script
├── testing.js            # Test script for dispatch only
├── package.json          # Node.js dependencies
└── README.md             # This file
```

---

## Disclaimer

- This bot is an **independent, unofficial project** and is **not affiliated with, endorsed by, or associated with Airline Manager 4** or its developers.
- Use of automation tools may be subject to the **Terms of Service** of Airline Manager 4. By using this bot, you accept full responsibility for any consequences, including potential account suspension.
- The author(s) of this project accept **no liability** for any loss of in-game currency, items, account access, or any other damages arising from the use of this software.
- This software is provided **"as is"**, without warranty of any kind, express or implied.

---

## License

Copyright © 2024 nem-web

This project is licensed under the **MIT License**.

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Contact

For questions, issues, or further assistance (including help finding your AM4 login string):

📧 **user.digitech94@gmail.com**

You can also open a [GitHub Issue](../../issues) for bug reports or feature requests.
