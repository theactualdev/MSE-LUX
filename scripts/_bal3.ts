import 'dotenv/config'
export {}
const r = await fetch('https://api.shipbubble.com/v1/shipping/wallet/balance', {
  headers: { Authorization: `Bearer ${process.env.SHIPBUBBLE_API_KEY ?? ''}` },
})
console.log(JSON.stringify(await r.json()))
