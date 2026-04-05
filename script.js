const BASE = "https://airlinemanager.com";

const FUEL_URL = BASE + "/fuel.php?m=nonav";
const CO2_URL = BASE + "/co2.php";
const ROUTES_URL = BASE + "/routes.php";
const BANK_URL = BASE + "/banking.php";
const DEPART_URL = BASE + "/route_depart.php?mode=all&ref=list&hasCostIndex=0&costIndex=200&ids=";

// ===== CONFIG =====
const COOKIE = process.env.COOKIE;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// ===== SETTINGS =====
const fuelThreshold = 450;
const co2Threshold = 115;
const maxAmount = 200000;
const cashAlertLimit = 10000;

// ===== MEMORY =====
let fuelHistory = [];
let co2History = [];
let lastFuelPrice = null;
let lastCO2Price = null;

// ===== FETCH =====
async function fetchPage(url) {
    const res = await fetch(url, {
        method: "GET",
        headers: {
            "Cookie": COOKIE,
            "User-Agent": "Mozilla/5.0",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": BASE + "/",
            "Accept": "text/html, */*; q=0.01"
        }
    });

    const text = await res.text();

    console.log("FETCH:", url);
    console.log(text.slice(0, 150));

    return text;
}

// ===== PARSE =====
function extractPrice(html) {
    const matches = [...html.matchAll(/\$\s?([\d,]+)/g)];
    if (!matches.length) return null;

    // take last match (more reliable for AM4 pages)
    return parseInt(matches[matches.length - 1][1].replace(/,/g, ""));
}

function extractCash(html) {
    const match = html.match(/\$ ([\d,]+)/);
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
    if (!threshold || history.length === 0) return false;
    const min = getMin(history);
    return price <= threshold && price <= min + 50;
}

// ===== TELEGRAM =====
async function sendTelegram(msg) {
    try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: msg
            })
        });
    } catch (e) {
        console.log("Telegram failed");
    }
}

// ===== AIRCRAFT COUNT =====
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
                headers: {
                    "Cookie": COOKIE,
                    "User-Agent": "Mozilla/5.0",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": BASE + "/"
                }
            });

            await sendTelegram(`✈️ Departed ${count} aircraft`);
        }

    } catch (e) {
        await sendTelegram("❌ Depart failed");
    }
}

// ===== BUY =====
async function autoBuy(type, amount, price) {
    const url = type === "fuel"
        ? `${BASE}/fuel.php?mode=do&amount=${amount}`
        : `${BASE}/co2.php?mode=do&amount=${amount}`;

    try {
        await fetch(url, {
            headers: {
                "Cookie": COOKIE,
                "User-Agent": "Mozilla/5.0",
                "Referer": BASE + "/"
            }
        });

        const total = price * amount;

        await sendTelegram(
`✅ ${type.toUpperCase()} BOUGHT
Price: $${price}
Amount: ${amount}
Total: $${total}`
        );

    } catch {
        await sendTelegram(`❌ ${type} buy failed`);
    }
}

// ===== CASH =====
async function checkCash() {
    const html = await fetchPage(BANK_URL);
    const cash = extractCash(html);

    console.log("Cash:", cash);

    if (cash && cash > cashAlertLimit) {
        await sendTelegram(`💰 Cash: $${cash}`);
    }
}

// ===== MAIN =====
async function run() {
    console.log("=== START ===");

    try {
        await sendTelegram("🚀 Bot running");

        // ✈️ DISPATCH
        await departAll();

        // 💰 CASH
        await checkCash();

        // ===== FUEL =====
        const fuelHTML = await fetchPage(FUEL_URL);
        const fuelPrice = extractPrice(fuelHTML);

        console.log("Fuel:", fuelPrice);

        if (fuelPrice) {
            updateHistory(fuelHistory, fuelPrice);

            if (fuelPrice !== lastFuelPrice) {
                await sendTelegram(`⛽ Fuel: $${fuelPrice}`);
                lastFuelPrice = fuelPrice;
            }

            if (shouldBuy(fuelPrice, fuelThreshold, fuelHistory)) {
                await autoBuy("fuel", maxAmount, fuelPrice);
            }
        } else {
            await sendTelegram("❌ Fuel price not found");
        }

        // ===== CO2 =====
        const co2HTML = await fetchPage(CO2_URL);
        const co2Price = extractPrice(co2HTML);

        console.log("CO2:", co2Price);

        if (co2Price) {
            updateHistory(co2History, co2Price);

            if (co2Price !== lastCO2Price) {
                await sendTelegram(`🌱 CO2: $${co2Price}`);
                lastCO2Price = co2Price;
            }

            if (shouldBuy(co2Price, co2Threshold, co2History)) {
                await autoBuy("co2", maxAmount, co2Price);
            }
        } else {
            await sendTelegram("❌ CO2 price not found");
        }

    } catch (err) {
        console.log(err);
        await sendTelegram("❌ ERROR: " + err.message);
    }

    console.log("=== END ===");
}

run();
