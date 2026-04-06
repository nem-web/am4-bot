import puppeteer from "puppeteer";

const LOGIN_URL = process.env.LOGIN_URL;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

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

(async () => {

    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox"]
    });

    const page = await browser.newPage();

    // LOGIN (using your account URL)
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });

    // OPEN MARKETING PAGE
    await page.goto("https://airlinemanager.com/marketing.php", {
        waitUntil: "networkidle2"
    });

    await page.waitForSelector(".stars");

    // ===== EXTRACT DATA =====
    const data = await page.evaluate(() => {

        const stars = document.querySelectorAll(".stars");

        const airlineRep = stars[0]?.innerText.trim();
        const cargoRep = stars[1]?.innerText.trim();

        // ===== BOOST TIMER =====
        let boostActive = false;
        let boostText = "Not active";

        const timer = document.querySelector("[id*='timer']");

        if (timer) {
            boostActive = true;
            boostText = timer.innerText.trim();
        }

        return {
            airlineRep,
            cargoRep,
            boostActive,
            boostText
        };
    });

    // ===== TELEGRAM REPORT =====
    let msg = `📊 AM4 STATUS\n\n`;
    msg += `✈️ Airline Reputation: ${data.airlineRep}%\n`;
    msg += `📦 Cargo Reputation: ${data.cargoRep}%\n\n`;

    if (data.boostActive) {
        msg += `🚀 Boost Active\n⏱ ${data.boostText}\n`;
    } else {
        msg += `⚠️ No Boost Active\n`;
    }

    // ===== OPTIMIZATION LOGIC =====
    let advice = "";

    if (!data.boostActive) {
        advice += "👉 Activate cargo boost NOW\n";
    }

    if (parseInt(data.cargoRep) < 60) {
        advice += "👉 Run cargo campaigns (type=2)\n";
    }

    if (parseInt(data.airlineRep) < 60) {
        advice += "👉 Run airline campaigns (type=1)\n";
    }

    if (data.boostActive && parseInt(data.cargoRep) > 70) {
        advice += "🔥 BEST TIME: Run cargo-heavy routes\n";
    }

    if (advice) {
        msg += `\n📊 Optimization:\n${advice}`;
    }

    await sendTelegram(msg);

    await browser.close();

})();
