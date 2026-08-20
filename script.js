import puppeteer from "puppeteer";

const LOGIN_URL = process.env.LOGIN_URL;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const fuelThreshold = 450;
const co2Threshold = 150;

const PURCHASE_RETRY_DELAY = 3000;

async function sendTelegram(message) {
    if (!TELEGRAM_TOKEN || !CHAT_ID) {
        console.log(message);
        return;
    }

    try {
        await fetch(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    text: message
                })
            }
        );
    } catch (err) {
        console.log("Telegram error:", err.message);
    }
}

async function getCash(page) {
    await page.goto(
        "https://airlinemanager.com/banking.php",
        { waitUntil: "networkidle2" }
    );

    return await page.evaluate(() => {
        const matches = document.body.innerText.match(/\$\s?([\d,]+)/g);

        if (!matches || !matches.length) {
            return 0;
        }

        const values = matches.map(v =>
            parseInt(v.replace(/[$,\s]/g, ""), 10)
        );

        return Math.max(...values);
    });
}

async function getAvailableCapacity(page) {
    return await page.evaluate(() => {
        const text = document.body.innerText.replace(/\s+/g, " ");

        let match = text.match(
            /([\d,]+)\s*\/\s*([\d,]+)/
        );

        if (match) {
            const current = parseInt(
                match[1].replace(/,/g, ""),
                10
            );

            const capacity = parseInt(
                match[2].replace(/,/g, ""),
                10
            );

            return Math.max(0, capacity - current);
        }

        match = text.match(
            /Available[:\s]+([\d,]+)/i
        );

        if (match) {
            return parseInt(
                match[1].replace(/,/g, ""),
                10
            );
        }

        match = text.match(
            /Remaining[:\s]+([\d,]+)/i
        );

        if (match) {
            return parseInt(
                match[1].replace(/,/g, ""),
                10
            );
        }

        return 0;
    });
}

async function getFuelData(page) {
    await page.goto(
        "https://airlinemanager.com/fuel.php",
        { waitUntil: "networkidle2" }
    );

    return await page.evaluate(() => {
        const text = document.body.innerText.replace(/\s+/g, " ");

        const prices = text.match(/\$\s?([\d,]+)/g);

        let price = null;

        if (prices && prices.length) {
            price = parseInt(
                prices[prices.length - 1]
                    .replace(/[$,\s]/g, ""),
                10
            );
        }

        let available = 0;

        let match = text.match(
            /([\d,]+)\s*\/\s*([\d,]+)/
        );

        if (match) {
            const current = parseInt(
                match[1].replace(/,/g, ""),
                10
            );

            const capacity = parseInt(
                match[2].replace(/,/g, ""),
                10
            );

            available = Math.max(
                0,
                capacity - current
            );
        }

        if (available === 0) {
            match = text.match(
                /Available[:\s]+([\d,]+)/i
            );

            if (match) {
                available = parseInt(
                    match[1].replace(/,/g, ""),
                    10
                );
            }
        }

        if (available === 0) {
            match = text.match(
                /Remaining[:\s]+([\d,]+)/i
            );

            if (match) {
                available = parseInt(
                    match[1].replace(/,/g, ""),
                    10
                );
            }
        }

        return {
            price,
            available
        };
    });
}

async function getCO2Data(page) {
    await page.goto(
        "https://airlinemanager.com/co2.php",
        { waitUntil: "networkidle2" }
    );

    return await page.evaluate(() => {
        let price = null;

        const elements = [
            ...document.querySelectorAll("span, b, div")
        ];

        for (const element of elements) {
            const text = element.innerText
                ?.trim()
                .replace(/\s+/g, " ");

            if (!text) continue;

            const match = text.match(
                /^\$\s?([\d,]+(?:\.\d+)?)$/
            );

            if (match) {
                price = parseFloat(
                    match[1].replace(/,/g, "")
                );
                break;
            }
        }

        if (price === null) {
            const text = document.body.innerText
                .replace(/\s+/g, " ");

            const prices = text.match(
                /\$\s?([\d,]+(?:\.\d+)?)/g
            );

            if (prices && prices.length) {
                price = parseFloat(
                    prices[0]
                        .replace(/[$,\s]/g, "")
                );
            }
        }

        const capacityElement =
            document.querySelector("#remCapacity");

        let available = 0;

        if (capacityElement) {
            available = parseInt(
                capacityElement.innerText
                    .replace(/,/g, "")
                    .trim(),
                10
            );
        }

        if (!Number.isFinite(available)) {
            available = 0;
        }

        return {
            price,
            available
        };
    });
}

async function buy(
    page,
    type,
    price,
    amount
) {
    const beforeCash = await getCash(page);

    const total = (price * amount) / 1000;

    console.log(
        `Buying ${amount.toLocaleString()} ${type} at $${price}/1000`
    );

    try {
        const response = await page.evaluate(
            async (type, amount) => {
                const r = await fetch(
                    `https://airlinemanager.com/${type}.php?mode=do&amount=${amount}`,
                    {
                        credentials: "include"
                    }
                );

                return {
                    ok: r.ok,
                    status: r.status,
                    text: await r.text()
                };
            },
            type,
            amount
        );

        console.log(
            `${type} purchase response:`,
            response.status
        );

    } catch (err) {
        console.log(
            `${type} purchase request error:`,
            err.message
        );

        await sendTelegram(
            `❌ ${type.toUpperCase()} purchase request failed\n` +
            `${err.message}`
        );

        return false;
    }

    await new Promise(
        resolve =>
            setTimeout(
                resolve,
                PURCHASE_RETRY_DELAY
            )
    );

    const afterCash = await getCash(page);

    if (afterCash < beforeCash) {
        await sendTelegram(
            `✅ ${type.toUpperCase()} BOUGHT\n` +
            `Price: $${price}/1000\n` +
            `Amount: ${amount.toLocaleString()}\n` +
            `Total: $${total.toLocaleString()}\n` +
            `Cash: $${afterCash.toLocaleString()}`
        );

        return true;
    }

    await sendTelegram(
        `❌ ${type.toUpperCase()} purchase failed\n` +
        `Price: $${price}/1000\n` +
        `Amount: ${amount.toLocaleString()}\n` +
        `Total: $${total.toLocaleString()}`
    );

    return false;
}

async function processFuel(page) {
    console.log("Checking fuel...");

    const data = await getFuelData(page);

    if (data.price === null) {
        await sendTelegram(
            "❌ Could not read fuel price."
        );
        return;
    }

    console.log(
        `Fuel: $${data.price}/1000 | Available: ${data.available.toLocaleString()}`
    );

    if (data.price > fuelThreshold) {
        console.log(
            `Fuel price $${data.price} is above threshold $${fuelThreshold}`
        );
        return;
    }

    if (data.available <= 0) {
        await sendTelegram(
            "⛽ Fuel storage is full."
        );
        return;
    }

    const amount = data.available;

    await sendTelegram(
        `🟢 FUEL BUYING\n` +
        `Price: $${data.price}/1000\n` +
        `Amount: ${amount.toLocaleString()}\n` +
        `Total: $${((data.price * amount) / 1000).toLocaleString()}`
    );

    let success = await buy(
        page,
        "fuel",
        data.price,
        amount
    );

    if (!success) {
        await sendTelegram(
            "🔄 Retrying fuel purchase..."
        );

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    PURCHASE_RETRY_DELAY
                )
        );

        const retryData = await getFuelData(page);

        if (
            retryData.price !== null &&
            retryData.price <= fuelThreshold &&
            retryData.available > 0
        ) {
            await buy(
                page,
                "fuel",
                retryData.price,
                retryData.available
            );
        }
    }
}

async function processCO2(page) {
    console.log("Checking CO2...");

    const data = await getCO2Data(page);

    if (data.price === null) {
        await sendTelegram(
            "❌ Could not read CO2 price."
        );
        return;
    }

    console.log(
        `CO2: $${data.price}/1000 | Available: ${data.available.toLocaleString()}`
    );

    if (data.price > co2Threshold) {
        console.log(
            `CO2 price $${data.price} is above threshold $${co2Threshold}`
        );
        return;
    }

    if (data.available <= 0) {
        await sendTelegram(
            "🌱 CO2 storage is full."
        );
        return;
    }

    const amount = data.available;

    await sendTelegram(
        `🟢 CO2 BUYING\n` +
        `Price: $${data.price}/1000\n` +
        `Amount: ${amount.toLocaleString()}\n` +
        `Total: $${((data.price * amount) / 1000).toLocaleString()}`
    );

    let success = await buy(
        page,
        "co2",
        data.price,
        amount
    );

    if (!success) {
        await sendTelegram(
            "🔄 Retrying CO2 purchase..."
        );

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    PURCHASE_RETRY_DELAY
                )
        );

        const retryData = await getCO2Data(page);

        if (
            retryData.price !== null &&
            retryData.price <= co2Threshold &&
            retryData.available > 0
        ) {
            await buy(
                page,
                "co2",
                retryData.price,
                retryData.available
            );
        }
    }
}

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox"
        ]
    });

    const page = await browser.newPage();

    try {
        await page.goto(
            LOGIN_URL,
            {
                waitUntil: "networkidle2"
            }
        );

        // Depart
        await page.goto(
            "https://airlinemanager.com/routes_main.php",
            {
                waitUntil: "networkidle2"
            }
        );

        const ids = await page.evaluate(() =>
            [
                ...document.querySelectorAll(
                    "[id^=routeMainList]"
                )
            ]
                .map(
                    el =>
                        el.id
                            .match(/\d+/)?.[0]
                )
                .filter(Boolean)
        );

        if (ids.length > 0) {
            const result = await page.evaluate(
                async ids => {
                    const r = await fetch(
                        `https://airlinemanager.com/route_depart.php?mode=all&ids=${ids.join(",")}`,
                        {
                            credentials: "include"
                        }
                    );

                    return await r.text();
                },
                ids
            );

            if (
                result.includes(
                    "playSound('depart')"
                )
            ) {
                await sendTelegram(
                    "✈️ Depart completed"
                );
            }
        }

        // Cash alert
        const cash = await getCash(page);

        if (cash > 10000000) {
            await sendTelegram(
                `💰 Cash: $${cash.toLocaleString()}`
            );
        }

        // Fuel
        await processFuel(page);

        // CO2
        await processCO2(page);

    } catch (err) {
        console.log(err);

        await sendTelegram(
            `❌ BOT ERROR\n${err.message}`
        );

    } finally {
        await browser.close();
    }
})();
