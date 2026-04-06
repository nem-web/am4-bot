import puppeteer from "puppeteer";
import fs from "fs";

// ===== CONFIG =====
const LOGIN_URL = process.env.LOGIN_URL;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// ===== SETTINGS =====
const fuelThreshold = 450;
const co2Threshold = 115;
const maxAmount = 200000;

const BOOST_INTERVAL = 60 * 60 * 1000;
const FILE = "memory.json";

// ===== TELEGRAM =====
async function sendTelegram(msg) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text: msg })
    });
}

// ===== MEMORY =====
function load() {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE));
}

function save(data) {
    fs.writeFileSync(FILE, JSON.stringify(data));
}

function formatTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
}

// ===== FETCH CASH =====
async function getCash(page) {
    await page.goto("https://airlinemanager.com/banking.php");
    return await page.evaluate(() => {
        const m = document.body.innerText.match(/\$\s?([\d,]+)/);
        return m ? parseInt(m[1].replace(/,/g, "")) : 0;
    });
}

// ===== BUY FUNCTION (RELIABLE) =====
async function buy(page, type, price, amount) {

    const before = await getCash(page);

    await page.evaluate(async (type, amount) => {
        await fetch(`https://airlinemanager.com/${type}.php?mode=do&amount=${amount}`, {
            credentials: "include"
        });
    }, type, amount);

    await new Promise(r => setTimeout(r, 3000));

    const after = await getCash(page);

    if (after < before) {
        const total = (price * amount) / 1000;

        await sendTelegram(
`✅ ${type.toUpperCase()} BOUGHT
Price: $${price}/1000
Amount: ${amount}
Total: $${total}`
        );
        return true;
    }

    return false;
}

(async () => {

    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox"]
    });

    const page = await browser.newPage();
    const memory = load();
    const now = Date.now();

    try {

        await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });

        // =====================
        // ✈️ DEPART
        // =====================
        await page.goto("https://airlinemanager.com/routes_main.php");

        const ids = await page.evaluate(() =>
            [...document.querySelectorAll("[id^=routeMainList]")]
                .map(el => el.id.match(/\d+/)?.[0])
                .filter(Boolean)
        );

        if (ids.length > 0) {
            const res = await page.evaluate(async (ids) => {
                const r = await fetch(
                    `https://airlinemanager.com/route_depart.php?mode=all&ids=${ids.join(",")}`,
                    { credentials: "include" }
                );
                return await r.text();
            }, ids);

            if (res.includes("playSound('depart')")) {
                await sendTelegram("✈️ Depart completed");
            }
        }

        // =====================
        // 💰 CASH + PROFIT
        // =====================
        const cash = await getCash(page);

        let profitPerHour = 0;
        if (memory.cash && memory.time) {
            const diffCash = cash - memory.cash;
            const diffTime = (now - memory.time) / 3600000;
            if (diffTime > 0) profitPerHour = Math.floor(diffCash / diffTime);
        }

        if (cash > 5000000) {
            await sendTelegram(`💰 Cash Alert: $${cash.toLocaleString()}`);
        }

        // =====================
        // ⛽ FUEL
        // =====================
        await page.goto("https://airlinemanager.com/fuel.php");

        const fuelPrice = await page.evaluate(() => {
            const m = document.body.innerText.match(/\$\s?([\d,]+)/g);
            return m ? parseInt(m.pop().replace(/[$,]/g, "")) : null;
        });

        if (fuelPrice !== null) {

            if (memory.lastFuel !== fuelPrice) {
                await sendTelegram(`⛽ Fuel Price: $${fuelPrice}/1000`);
                memory.lastFuel = fuelPrice;
            }

            if (fuelPrice <= fuelThreshold) {

                let success = await buy(page, "fuel", fuelPrice, maxAmount);

                if (!success) {
                    await sendTelegram("⚠️ Fuel retry...");
                    await buy(page, "fuel", fuelPrice, maxAmount);
                }
            }
        }

        // =====================
        // 🌱 CO2
        // =====================
        await page.goto("https://airlinemanager.com/co2.php");

        const co2Price = await page.evaluate(() => {
            const m = document.body.innerText.match(/\$\s?([\d,]+)/g);
            return m ? parseInt(m.pop().replace(/[$,]/g, "")) : null;
        });

        if (co2Price !== null) {

            if (memory.lastCO2 !== co2Price) {
                await sendTelegram(`🌱 CO2 Price: $${co2Price}/1000`);
                memory.lastCO2 = co2Price;
            }

            if (co2Price <= co2Threshold) {

                let success = await buy(page, "co2", co2Price, maxAmount);

                if (!success) {
                    await sendTelegram("⚠️ CO2 retry...");
                    await buy(page, "co2", co2Price, maxAmount);
                }
            }
        }

        // =====================
        // 📊 BOOST
        // =====================
        await page.goto("https://airlinemanager.com/marketing.php");

        const marketing = await page.evaluate(() => {

            const stars = document.querySelectorAll(".stars");

            const airlineRep = parseInt(stars[0]?.innerText || 0);
            const cargoRep = parseInt(stars[1]?.innerText || 0);

            const scripts = [...document.querySelectorAll("script")].map(s => s.innerText);

            let boosts = [];

            scripts.forEach(s => {
                const match = s.match(/timer\('(.+?)',(\d+)\)/);

                if (match) {
                    const id = match[1];
                    const seconds = parseInt(match[2]);

                    const row = document.querySelector(`#${id}`)?.closest("tr");
                    const text = row?.innerText.toLowerCase() || "";

                    if (text.includes("airline")) boosts.push({ type: "Airline", seconds });
                    if (text.includes("cargo")) boosts.push({ type: "Cargo", seconds });
                }
            });

            return { airlineRep, cargoRep, boosts };
        });

        const shouldSendBoost =
            !marketing.boosts.length ||
            !memory.lastBoostReport ||
            (now - memory.lastBoostReport > BOOST_INTERVAL);

        if (shouldSendBoost) {

            let msg = `📊 AM4 BOOST REPORT\n\n`;

            msg += `✈️ Airline Rep: ${marketing.airlineRep}%\n`;
            msg += `📦 Cargo Rep: ${marketing.cargoRep}%\n\n`;

            if (marketing.boosts.length > 0) {
                marketing.boosts.forEach(b => {
                    msg += `🚀 ${b.type} Boost (${formatTime(b.seconds)})\n`;
                });
            } else {
                msg += `⚠️ No Boost Active\n`;
            }

            if (profitPerHour > 0) {
                msg += `\n💰 Profit/hr: $${profitPerHour.toLocaleString()}\n`;
            }

            await sendTelegram(msg);

            memory.lastBoostReport = now;
        }

        // =====================
        // SAVE
        // =====================
        save({
            ...memory,
            cash,
            time: now
        });

    } catch (err) {
        console.log(err);
        await sendTelegram("❌ ERROR: " + err.message);
    }

    await browser.close();

})();
