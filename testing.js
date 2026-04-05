import puppeteer from "puppeteer";

// ===== CONFIG =====
const LOGIN_URL = process.env.LOGIN_URL;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// ===== TELEGRAM =====
async function sendTelegram(msg) {
    if (!TELEGRAM_TOKEN) return;

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: CHAT_ID,
            text: msg
        })
    });
}

// ===== MAIN =====
(async () => {

    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    try {

        console.log("🚀 Opening game...");
        await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });

        await sendTelegram("🧪 TEST: Dispatch started");

        // =====================
        // STEP 1: LOAD ROUTES
        // =====================
        console.log("Loading routes...");
        await page.goto(
            "https://airlinemanager.com/routes_main.php?undefined&fbSig=false",
            { waitUntil: "networkidle2" }
        );

        // =====================
        // STEP 2: EXTRACT IDS
        // =====================
        const ids = await page.evaluate(() => {
            const elements = document.querySelectorAll("[id^=routeMainList]");
            const ids = [];

            elements.forEach(el => {
                const match = el.id.match(/\d+/);
                if (match) ids.push(match[0]);
            });

            return ids;
        });

        console.log("Aircraft IDs:", ids);

        if (ids.length === 0) {
            console.log("No aircraft found");
            await sendTelegram("⚠️ TEST: No aircraft found");
            await browser.close();
            return;
        }

        const idString = ids.join(",");

        // =====================
        // STEP 3: DEPART ALL
        // =====================
        console.log("Sending depart request...");

        const responseText = await page.evaluate(async (idString) => {

            const res = await fetch(
                `https://airlinemanager.com/route_depart.php?mode=all&ref=list&hasCostIndex=0&costIndex=200&ids=${idString}&fbSig=false`,
                {
                    method: "GET",
                    credentials: "include"
                }
            );

            return await res.text();

        }, idString);

        console.log("Response length:", responseText.length);

        // =====================
        // RESULT CHECK
        // =====================
        if (responseText.includes("playSound('depart')")) {
            console.log("✅ Depart SUCCESS");
            await sendTelegram(`✈️ TEST SUCCESS: Depart triggered for ${ids.length} aircraft`);
        } else {
            console.log("❌ Depart FAILED");
            await sendTelegram("❌ TEST FAILED: Depart not triggered");
        }

    } catch (err) {
        console.log("ERROR:", err);
        await sendTelegram("❌ TEST ERROR: " + err.message);
    }

    await browser.close();

})();
