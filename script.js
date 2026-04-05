import puppeteer from "puppeteer";

// ===== CONFIG =====
const LOGIN_URL = process.env.LOGIN_URL;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// ===== SETTINGS =====
const fuelThreshold = 450;
const co2Threshold = 115;
const maxAmount = 200000;
const cashAlertLimit = 5000000;

// ===== MEMORY =====
let lastFuelPrice = null;
let lastCO2Price = null;

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

// ===== PRICE EXTRACT =====
function extractLastPrice(text) {
    const matches = text.match(/\$\s?[\d,]+/g);
    if (!matches) return null;
    return parseInt(matches.pop().replace(/[$, ]/g, ""));
}

// ===== MAIN =====
(async () => {

    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    try {

        // ===== LOGIN =====
        await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });
        await sendTelegram("🚀 Bot Started");

        // =====================
        // ✈️ DISPATCH (ONLY LANDED)
        // =====================
        await page.goto("https://airlinemanager.com/routes.php", { waitUntil: "networkidle2" });

        const landedAircraft = await page.evaluate(() => {
            let count = 0;

            document.querySelectorAll("[id^=routesTimer]").forEach(el => {
                const text = el.innerText.trim();

                if (!text || text === "00:00:00") {
                    count++;
                }
            });

            return count;
        });

        if (landedAircraft > 0) {
            await page.goto("https://airlinemanager.com/route_depart.php?mode=all&ref=list&hasCostIndex=0&costIndex=200&ids=");
            await sendTelegram(`✈️ Departed ${landedAircraft} aircraft`);
        } else {
            await sendTelegram("✈️ No aircraft ready for departure");
        }

        // =====================
        // 💰 CASH CHECK
        // =====================
        await page.goto("https://airlinemanager.com/banking.php", { waitUntil: "networkidle2" });

        const cash = await page.evaluate(() => {
            const match = document.body.innerText.match(/\$\s?([\d,]+)/);
            return match ? parseInt(match[1].replace(/,/g, "")) : null;
        });

        if (cash && cash > cashAlertLimit) {
            await sendTelegram(`💰 Cash Alert: $${cash}`);
        }

        // =====================
        // ⛽ FUEL
        // =====================
        await page.goto("https://airlinemanager.com/fuel.php", { waitUntil: "networkidle2" });

        const fuelPrice = await page.evaluate(() => {
            const text = document.body.innerText;
            const matches = text.match(/\$\s?[\d,]+/g);
            if (!matches) return null;
            return parseInt(matches.pop().replace(/[$, ]/g, ""));
        });

        if (fuelPrice !== null) {

            if (fuelPrice !== lastFuelPrice) {
                await sendTelegram(`⛽ Fuel Price (per 1000): $${fuelPrice}`);
                lastFuelPrice = fuelPrice;
            }

            if (fuelPrice <= fuelThreshold) {

                await page.goto(`https://airlinemanager.com/fuel.php?mode=do&amount=${maxAmount}`);

                const totalCost = (fuelPrice * maxAmount) / 1000;

                await sendTelegram(
`✅ FUEL BOUGHT
Price (per 1000): $${fuelPrice}
Amount: ${maxAmount}
Total Cost: $${totalCost}`
                );
            }

        } else {
            await sendTelegram("❌ Fuel price not detected");
        }

        // =====================
        // 🌱 CO2
        // =====================
        await page.goto("https://airlinemanager.com/co2.php", { waitUntil: "networkidle2" });

        const co2Price = await page.evaluate(() => {
            const text = document.body.innerText;
            const matches = text.match(/\$\s?[\d,]+/g);
            if (!matches) return null;
            return parseInt(matches.pop().replace(/[$, ]/g, ""));
        });

        if (co2Price !== null) {

            if (co2Price !== lastCO2Price) {
                await sendTelegram(`🌱 CO2 Price (per 1000): $${co2Price}`);
                lastCO2Price = co2Price;
            }

            if (co2Price <= co2Threshold) {

                await page.goto(`https://airlinemanager.com/co2.php?mode=do&amount=${maxAmount}`);

                const totalCost = (co2Price * maxAmount) / 1000;

                await sendTelegram(
`✅ CO2 BOUGHT
Price (per 1000): $${co2Price}
Amount: ${maxAmount}
Total Cost: $${totalCost}`
                );
            }

        } else {
            await sendTelegram("❌ CO2 price not detected");
        }

    } catch (err) {
        console.log(err);
        await sendTelegram("❌ ERROR: " + err.message);
    }

    await browser.close();

})();
