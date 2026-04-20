import puppeteer from "puppeteer";

// ===== CONFIG =====
const LOGIN_URL = process.env.LOGIN_URL;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// ===== TELEGRAM =====
async function sendTelegram(msg) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text: msg })
    });
}

function formatTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
}

(async () => {

    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox"]
    });

    const page = await browser.newPage();

    try {
        await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });

        // =====================
        // ✈️ DEPART LANDED PLANES
        // =====================
        await page.goto("https://airlinemanager.com/routes_main.php");

        const ids = await page.evaluate(() =>
            [...document.querySelectorAll("[id^=routeMainList]")]
                .map(el => el.id.match(/\d+/)?.[0])
                .filter(Boolean)
        );

        let departStatus = "No planes ready";

        if (ids.length > 0) {
            const res = await page.evaluate(async (ids) => {
                const r = await fetch(
                    `https://airlinemanager.com/route_depart.php?mode=all&ids=${ids.join(",")}`,
                    { credentials: "include" }
                );
                return await r.text();
            }, ids);

            if (res.includes("playSound('depart')")) {
                departStatus = `Departed ${ids.length} planes`;
            }
        }

        // =====================
        // 📊 BOOST STATUS
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

        // =====================
        // 📩 SINGLE MESSAGE
        // =====================
        let msg = `✈️ AM4 STATUS\n\n`;

        msg += `🛫 ${departStatus}\n\n`;

        msg += `📊 Airline Rep: ${marketing.airlineRep}%\n`;
        msg += `📦 Cargo Rep: ${marketing.cargoRep}%\n\n`;

        if (marketing.boosts.length > 0) {
            marketing.boosts.forEach(b => {
                msg += `🚀 ${b.type} Boost (${formatTime(b.seconds)})\n`;
            });
        } else {
            msg += `⚠️ No Boost Active\n`;
        }

        await sendTelegram(msg);

    } catch (err) {
        console.log(err);
        await sendTelegram("❌ ERROR: " + err.message);
    }

    await browser.close();

})();
