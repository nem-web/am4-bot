const FUEL_URL = "https://airlinemanager.com/fuel.php?m=nonav";
const CO2_URL = "https://airlinemanager.com/co2.php";

// ===== CONFIG =====
const COOKIE = process.env.COOKIE; // stored in GitHub Secrets
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const fuelThreshold = 900;   // set your value
const co2Threshold = 120;    // set your value
const maxAmount = 50000;

// ===== MEMORY =====
let fuelHistory = [];
let co2History = [];

// ===== FETCH =====
async function fetchPage(url) {
    const res = await fetch(url, {
        headers: {
            "Cookie": COOKIE,
            "User-Agent": "Mozilla/5.0"
        }
    });
    return await res.text();
}

// ===== PARSE =====
function extractPrice(html) {
    const match = html.match(/\$\s?([\d,]+)/);
    return match ? parseInt(match[1].replace(/,/g, "")) : null;
}

function updateHistory(arr, value) {
    arr.push(value);
    if (arr.length > 10) arr.shift();
}

function getMin(arr) {
    return Math.min(...arr);
}

function shouldBuy(price, threshold, history) {
    if (!threshold) return false;
    const min = getMin(history);
    return price <= threshold && price <= min + 50;
}

// ===== BUY =====
async function autoBuy(type, amount, price) {
    const url = type === "fuel"
        ? `https://airlinemanager.com/fuel.php?mode=do&amount=${amount}`
        : `https://airlinemanager.com/co2.php?mode=do&amount=${amount}`;

    await fetch(url, {
        headers: { "Cookie": COOKIE }
    });

    console.log(`${type} bought @ $${price}`);

    await sendTelegram(`✅ ${type.toUpperCase()} BOUGHT\nPrice: $${price}\nAmount: ${amount}`);
}

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
async function run() {

    console.log("Running check...");

    // FUEL
    const fuelHTML = await fetchPage(FUEL_URL);
    const fuelPrice = extractPrice(fuelHTML);

    if (fuelPrice) {
        updateHistory(fuelHistory, fuelPrice);

        if (shouldBuy(fuelPrice, fuelThreshold, fuelHistory)) {
            await autoBuy("fuel", maxAmount, fuelPrice);
        }
    }

    // CO2
    const co2HTML = await fetchPage(CO2_URL);
    const co2Price = extractPrice(co2HTML);

    if (co2Price) {
        updateHistory(co2History, co2Price);

        if (shouldBuy(co2Price, co2Threshold, co2History)) {
            await autoBuy("co2", maxAmount, co2Price);
        }
    }

    console.log("Done.");
}

run();
