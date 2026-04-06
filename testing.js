import puppeteer from "puppeteer";
import fs from "fs";

const LOGIN_URL = process.env.LOGIN_URL;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const FILE = "profit.json";

// ===== TELEGRAM =====
async function sendTelegram(msg) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: CHAT_ID,
            text: msg
        })
    });
}

// ===== LOAD / SAVE =====
function load() {
    if (!fs.existsSync(FILE)) return null;
    return JSON.parse(fs.readFileSync(FILE));
}

function save(data) {
    fs.writeFileSync(FILE, JSON.stringify(data));
}

(async () => {

    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox"]
    });

    const page = await browser.newPage();

    await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });

    // ===== MARKETING PAGE =====
    await page.goto("https://airlinemanager.com/marketing.php", {
        waitUntil: "networkidle2"
    });

    await page.waitForSelector(".stars");

    const marketing = await page.evaluate(() => {

        const stars = document.querySelectorAll(".stars");

        const airlineRep = parseInt(stars[0]?.innerText.trim());
        const cargoRep = parseInt(stars[1]?.innerText.trim());

        // ===== BOOST DETECTION =====
        const rows = document.querySelectorAll("#active-campaigns tr");

        let boosts = [];

        rows.forEach(row => {
            const text = row.innerText.toLowerCase();

            const timerEl = row.querySelector("[id*='timer']");
            const time = timerEl ? timerEl.innerText.trim() : "";

            if (text.includes("airline video boost")) {
                boosts.push({
                    type: "Airline",
                    time
                });
            }

            if (text.includes("cargo video boost")) {
                boosts.push({
                    type: "Cargo",
                    time
                });
            }
        });

        return { airlineRep, cargoRep, boosts };
    });

    // ===== BANK PAGE (for profit) =====
    await page.goto("https://airlinemanager.com/banking.php", {
        waitUntil: "networkidle2"
    });

    const cash = await page.evaluate(() => {
        const text = document.body.innerText;
        const match = text.match(/\$\s?([\d,]+)/);
        return match ? parseInt(match[1].replace(/,/g, "")) : 0;
    });

    // ===== PROFIT TRACKING =====
    const now = Date.now();
    let profitPerHour = 0;

    const old = load();

    if (old) {
        const diffCash = cash - old.cash;
        const diffTime = (now - old.time) / (1000 * 60 * 60);

        if (diffTime > 0) {
            profitPerHour = Math.floor(diffCash / diffTime);
        }
    }

    save({ cash, time: now });

    // ===== MESSAGE =====
    let msg = `📊 AM4 ADVANCED REPORT\n\n`;

    msg += `✈️ Airline Rep: ${marketing.airlineRep}%\n`;
    msg += `📦 Cargo Rep: ${marketing.cargoRep}%\n\n`;

    // ===== BOOST DISPLAY =====
    if (marketing.boosts.length > 0) {
        marketing.boosts.forEach(b => {
            msg += `🚀 ${b.type} Boost Active (${b.time})\n`;
        });
    } else {
        msg += `⚠️ No Boost Active\n`;
    }

    // ===== PROFIT =====
    if (profitPerHour !== 0) {
        msg += `\n💰 Profit/hr: $${profitPerHour.toLocaleString()}\n`;
    }

    // ===== SMART ADVICE =====
    msg += `\n📊 Strategy:\n`;

    if (!marketing.boosts.find(b => b.type === "Cargo")) {
        msg += "👉 Start Cargo Boost\n";
    }

    if (!marketing.boosts.find(b => b.type === "Airline")) {
        msg += "👉 Start Airline Boost\n";
    }

    if (marketing.cargoRep < 60) {
        msg += "👉 Run Cargo Campaign\n";
    }

    if (marketing.airlineRep < 60) {
        msg += "👉 Run Airline Campaign\n";
    }

    if (profitPerHour < 1000000) {
        msg += "👉 Improve routes / utilization\n";
    }

    if (marketing.boosts.length > 0 && marketing.cargoRep > 70) {
        msg += "🔥 BEST TIME: Run cargo flights\n";
    }

    await sendTelegram(msg);

    await browser.close();

})();
