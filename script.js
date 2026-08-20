import puppeteer from "puppeteer";

const LOGIN_URL = process.env.LOGIN_URL;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const fuelThreshold = 450;
const co2Threshold = 150;

const RETRY_DELAY = 3000;

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
        const matches =
            document.body.innerText.match(/\$\s?([\d,]+)/g);

        if (!matches || !matches.length) {
            return 0;
        }

        const values = matches.map(value =>
            parseInt(
                value.replace(/[$,\s]/g, ""),
                10
            )
        );

        return Math.max(...values);
    });
}

async function buyMarketingCampaign(page) {
    console.log("Checking marketing campaign...");

    await page.goto(
        "https://airlinemanager.com/marketing.php",
        { waitUntil: "networkidle2" }
    );

    const activeCampaign = await page.evaluate(() => {
        const body =
            document.body.innerText
                .replace(/\s+/g, " ")
                .toLowerCase();

        const activeWords = [
            "campaign active",
            "active campaign",
            "campaign running",
            "currently active",
            "campaign ends",
            "campaign ending",
            "time remaining",
            "remaining time"
        ];

        for (const word of activeWords) {
            if (body.includes(word)) {
                return true;
            }
        }

        const elements = [
            ...document.querySelectorAll("[id], [class]")
        ];

        for (const element of elements) {
            const text =
                element.innerText
                    ?.replace(/\s+/g, " ")
                    .trim()
                    .toLowerCase() || "";

            const id =
                element.id?.toLowerCase() || "";

            const className =
                element.className
                    ?.toString()
                    .toLowerCase() || "";

            const combined =
                `${text} ${id} ${className}`;

            if (
                combined.includes("campaign") &&
                (
                    combined.includes("timer") ||
                    combined.includes("countdown") ||
                    combined.includes("remaining") ||
                    combined.includes("active") ||
                    combined.includes("ends")
                )
            ) {
                return true;
            }
        }

        return false;
    });

    if (activeCampaign) {
        console.log("Marketing campaign already active.");

        await sendTelegram(
            "📢 Marketing campaign already active"
        );

        return true;
    }

    await sendTelegram(
        "📢 No active marketing campaign. Buying Eco-Friendly campaign..."
    );

    await page.goto(
        "https://airlinemanager.com/marketing_new.php?type=5",
        { waitUntil: "networkidle2" }
    );

    const result = await page.evaluate(async () => {
        const response = await fetch(
            "https://airlinemanager.com/marketing_new.php?type=5&mode=do&c=1",
            {
                credentials: "include"
            }
        );

        return {
            ok: response.ok,
            status: response.status,
            text: await response.text()
        };
    });

    console.log(
        "Marketing purchase response:",
        result.status
    );

    await new Promise(
        resolve =>
            setTimeout(resolve, RETRY_DELAY)
    );

    await page.goto(
        "https://airlinemanager.com/marketing.php",
        { waitUntil: "networkidle2" }
    );

    await sendTelegram(
        "✅ Eco-Friendly marketing campaign bought"
    );

    return true;
}

async function getFuelData(page) {
    await page.goto(
        "https://airlinemanager.com/fuel.php",
        { waitUntil: "networkidle2" }
    );

    return await page.evaluate(() => {
        const text =
            document.body.innerText
                .replace(/\s+/g, " ");

        const prices =
            text.match(/\$\s?([\d,]+)/g);

        let price = null;

        if (prices && prices.length) {
            price = parseFloat(
                prices[prices.length - 1]
                    .replace(/[$,\s]/g, "")
            );
        }

        let available = 0;

        let match =
            text.match(
                /([\d,]+)\s*\/\s*([\d,]+)/
            );

        if (match) {
            const current =
                parseInt(
                    match[1].replace(/,/g, ""),
                    10
                );

            const capacity =
                parseInt(
                    match[2].replace(/,/g, ""),
                    10
                );

            available =
                Math.max(
                    0,
                    capacity - current
                );
        }

        if (available === 0) {
            match =
                text.match(
                    /Available[:\s]+([\d,]+)/i
                );

            if (match) {
                available =
                    parseInt(
                        match[1].replace(/,/g, ""),
                        10
                    );
            }
        }

        if (available === 0) {
            match =
                text.match(
                    /Remaining[:\s]+([\d,]+)/i
                );

            if (match) {
                available =
                    parseInt(
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
            ...document.querySelectorAll(
                "span, b, div"
            )
        ];

        for (const element of elements) {
            const text =
                element.innerText
                    ?.trim()
                    .replace(/\s+/g, " ");

            if (!text) {
                continue;
            }

            const match =
                text.match(
                    /^\$\s?([\d,]+(?:\.\d+)?)$/
                );

            if (match) {
                price =
                    parseFloat(
                        match[1].replace(/,/g, "")
                    );

                break;
            }
        }

        if (price === null) {
            const text =
                document.body.innerText
                    .replace(/\s+/g, " ");

            const prices =
                text.match(
                    /\$\s?([\d,]+(?:\.\d+)?)/g
                );

            if (prices && prices.length) {
                price =
                    parseFloat(
                        prices[0]
                            .replace(/[$,\s]/g, "")
                    );
            }
        }

        const capacityElement =
            document.querySelector("#remCapacity");

        const holdingElement =
            document.querySelector("#holding");

        const capacity =
            capacityElement
                ? parseInt(
                    capacityElement.innerText
                        .replace(/,/g, "")
                        .trim(),
                    10
                )
                : 0;

        const holding =
            holdingElement
                ? parseInt(
                    holdingElement.innerText
                        .replace(/,/g, "")
                        .trim(),
                    10
                )
                : 0;

        return {
            price,
            capacity: Number.isFinite(capacity)
                ? capacity
                : 0,
            holding: Number.isFinite(holding)
                ? holding
                : 0
        };
    });
}

async function buy(
    page,
    type,
    price,
    amount
) {
    const beforeCash =
        await getCash(page);

    const total =
        (price * amount) / 1000;

    try {
        const response =
            await page.evaluate(
                async (type, amount) => {
                    const r =
                        await fetch(
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
            `${type} response:`,
            response.status
        );

    } catch (err) {
        await sendTelegram(
            `❌ ${type.toUpperCase()} purchase request failed\n${err.message}`
        );

        return false;
    }

    await new Promise(
        resolve =>
            setTimeout(resolve, RETRY_DELAY)
    );

    const afterCash =
        await getCash(page);

    if (afterCash < beforeCash) {
        await sendTelegram(
            `✅ ${type.toUpperCase()} BOUGHT\n` +
            `Price: $${price}/1000\n` +
            `Amount: ${amount.toLocaleString()}\n` +
            `Total: $${total.toLocaleString()}`
        );

        return true;
    }

    await sendTelegram(
        `❌ ${type.toUpperCase()} purchase failed\n` +
        `Amount: ${amount.toLocaleString()}\n` +
        `Total: $${total.toLocaleString()}`
    );

    return false;
}

async function processFuel(page) {
    console.log("Checking fuel...");

    const data =
        await getFuelData(page);

    if (data.price === null) {
        await sendTelegram(
            "❌ Could not read fuel price"
        );
        return;
    }

    console.log(
        `Fuel: $${data.price}/1000 | Available: ${data.available.toLocaleString()}`
    );

    if (data.price > fuelThreshold) {
        return;
    }

    if (data.available <= 0) {
        await sendTelegram(
            "⛽ Fuel storage is full"
        );
        return;
    }

    const amount =
        data.available;

    await sendTelegram(
        `🟢 FUEL BUYING\n` +
        `Price: $${data.price}/1000\n` +
        `Amount: ${amount.toLocaleString()}\n` +
        `Total: $${((data.price * amount) / 1000).toLocaleString()}`
    );

    const success =
        await buy(
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
                setTimeout(resolve, RETRY_DELAY)
        );

        const retry =
            await getFuelData(page);

        if (
            retry.price !== null &&
            retry.price <= fuelThreshold &&
            retry.available > 0
        ) {
            await buy(
                page,
                "fuel",
                retry.price,
                retry.available
            );
        }
    }
}

async function processCO2(page) {
    console.log("Checking CO2...");

    const data =
        await getCO2Data(page);

    if (data.price === null) {
        await sendTelegram(
            "❌ Could not read CO2 price"
        );
        return;
    }

    console.log(
        `CO2: $${data.price}/1000 | Capacity: ${data.capacity.toLocaleString()} | Holding: ${data.holding.toLocaleString()}`
    );

    if (data.price > co2Threshold) {
        return;
    }

    const amount =
        data.capacity +
        Math.max(0, -data.holding);

    if (amount <= 0) {
        await sendTelegram(
            "🌱 CO2 storage does not require a purchase"
        );
        return;
    }

    const total =
        (data.price * amount) / 1000;

    await sendTelegram(
        `🟢 CO2 BUYING\n` +
        `Price: $${data.price}/1000\n` +
        `Capacity: ${data.capacity.toLocaleString()}\n` +
        `Holding: ${data.holding.toLocaleString()}\n` +
        `Amount: ${amount.toLocaleString()}\n` +
        `Total: $${total.toLocaleString()}`
    );

    const success =
        await buy(
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
                setTimeout(resolve, RETRY_DELAY)
        );

        const retry =
            await getCO2Data(page);

        if (
            retry.price !== null &&
            retry.price <= co2Threshold
        ) {
            const retryAmount =
                retry.capacity +
                Math.max(0, -retry.holding);

            if (retryAmount > 0) {
                await buy(
                    page,
                    "co2",
                    retry.price,
                    retryAmount
                );
            }
        }
    }
}

async function departAll(page) {
    console.log("Checking routes...");

    await page.goto(
        "https://airlinemanager.com/routes_main.php",
        { waitUntil: "networkidle2" }
    );

    const ids =
        await page.evaluate(() =>
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

    if (!ids.length) {
        await sendTelegram(
            "✈️ No routes found"
        );
        return;
    }

    const result =
        await page.evaluate(
            async ids => {
                const r =
                    await fetch(
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
            `✈️ DEPART COMPLETED\nRoutes: ${ids.length}`
        );
    } else {
        await sendTelegram(
            "⚠️ Depart request sent but completion could not be verified"
        );
    }
}

(async () => {
    const browser =
        await puppeteer.launch({
            headless: "new",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox"
            ]
        });

    const page =
        await browser.newPage();

    try {
        await page.goto(
            LOGIN_URL,
            { waitUntil: "networkidle2" }
        );

        await buyMarketingCampaign(page);

        await processFuel(page);

        await processCO2(page);

        await departAll(page);

        console.log(
            "Workflow completed."
        );

    } catch (err) {
        console.error(err);

        await sendTelegram(
            `❌ BOT ERROR\n${err.message}`
        );

    } finally {
        await browser.close();
    }
})();
