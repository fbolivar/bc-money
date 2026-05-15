export const config = { runtime: 'edge' };

export default async function handler(): Promise<Response> {
    const [usdRes, eurRes] = await Promise.all([
        fetch('https://open.er-api.com/v6/latest/USD'),
        fetch('https://open.er-api.com/v6/latest/EUR'),
    ]);

    if (!usdRes.ok || !eurRes.ok) {
        return new Response(JSON.stringify({ error: 'upstream error' }), { status: 502 });
    }

    const [usdData, eurData] = await Promise.all([usdRes.json(), eurRes.json()]);

    return new Response(JSON.stringify({
        usdCop: usdData.rates.COP,
        eurCop: eurData.rates.COP,
        usdEur: usdData.rates.EUR,
        date: new Date().toISOString().slice(0, 10),
    }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=3600' },
    });
}
