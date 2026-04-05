const FUEL_URL = "https://airlinemanager.com/fuel.php?m=nonav";
const CO2_URL = "https://airlinemanager.com/co2.php";
const ROUTES_URL = "https://airlinemanager.com/routes.php";
const BANK_URL = "https://airlinemanager.com/banking.php";
const DEPART_URL = "https://airlinemanager.com/route_depart.php?mode=all&ref=list&hasCostIndex=0&costIndex=200&ids=";

// ===== CONFIG =====
const COOKIE = process.env.COOKIE;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// ===== SETTINGS =====
const fuelThreshold = 450;
const co2Threshold = 115;
const maxAmount = 200000;
// const cashAlertLimit = 5000000;
const cashAlertLimit = 10000;

// ===== MEMORY =====
let fuelHistory = [];
let co2History = [];
let lastFuelPrice = null;
let lastCO2Price = null;

// ===== FETCH =====
async function fetchPage(url) {
    const res = await fetch(url, {
        headers: {
            "Cookie": COOKIE,
            "User-Agent": "Mozilla/5.0",
            "X-Requested-With": "XMLHttpRequest"
        }
    });
    return await res.text();
}

// ===== PARSE =====
function extractPrice(html) {
    const match = html.match(/\$\s?([\d,]+)/);
    return match ? parseInt(match[1].replace(/,/g, "")) : null;
}

function extractCash(html) {
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

// ===== COUNT AIRCRAFT =====
function countAircraft(html) {
    const matches = html.match(/routeMainList/g);
    return matches ? matches.length : 0;
}

// ===== DEPART =====
async function departAll() {
    try {
        const html = await fetchPage(ROUTES_URL);
        const count = countAircraft(html);

        if (count > 0) {
            await fetch(DEPART_URL, {
                method: "GET",
                headers: {
                    "Cookie": COOKIE,
                    "User-Agent": "Mozilla/5.0",
                    "X-Requested-With": "XMLHttpRequest"
                }
            });

            await sendTelegram(`✈️ Departed ${count} aircraft`);
        }

    } catch {
        await sendTelegram("❌ Depart failed");
    }
}

// ===== BUY =====
async function autoBuy(type, amount, price) {
    const url = type === "fuel"
        ? `https://airlinemanager.com/fuel.php?mode=do&amount=${amount}`
        : `https://airlinemanager.com/co2.php?mode=do&amount=${amount}`;

    try {
        await fetch(url, {
            method: "GET",
            headers: {
                "Cookie": COOKIE,
                "User-Agent": "Mozilla/5.0"
            }
        });

        const total = price * amount;

        await sendTelegram(
`✅ ${type.toUpperCase()} BOUGHT
Price: $${price}
Amount: ${amount}
Total Cost: $${total}`
        );

    } catch {
        await sendTelegram(`❌ ${type} buy failed`);
    }
}

// ===== CHECK CASH =====
async function checkCash() {
    const html = await fetchPage(BANK_URL);
    const cash = extractCash(html);

    if (cash && cash > cashAlertLimit) {
        await sendTelegram(`💰 Cash Alert: $${cash}`);
    }
}

// ===== MAIN =====
async function run() {
    console.log("=== BOT STARTED ===");

    try {

        await sendTelegram("🚀 Bot started"); // TEST MESSAGE

        // ✈️ DISPATCH
        console.log("Checking dispatch...");
        await departAll();

        // 💰 CASH
        console.log("Checking cash...");
        await checkCash();

        // ⛽ FUEL
        console.log("Checking fuel...");
        const fuelHTML = await fetchPage(FUEL_URL);
        console.log("Fuel HTML fetched");

        const fuelPrice = extractPrice(fuelHTML);
        console.log("Fuel price:", fuelPrice);

        // 🌱 CO2
        console.log("Checking CO2...");
        const co2HTML = await fetchPage(CO2_URL);

        const co2Price = extractPrice(co2HTML);
        console.log("CO2 price:", co2Price);

    } catch (err) {
        console.log("ERROR:", err);
        await sendTelegram("❌ BOT ERROR: " + err.message);
    }

    console.log("=== BOT END ===");
}

run();
