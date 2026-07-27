// Keep-alive do Supabase (plano free) para o projeto nao pausar por
// inatividade (~7 dias sem pedidos), o que estava a quebrar o acesso Wi-Fi.
//
// Um Vercel Cron (ver vercel.json) chama esta funcao 1x/dia. Ela faz um
// pedido leve a API REST do Supabase, o que conta como atividade.
//
// A anon key e publica por design (ja consta em supabase-config.js, servida
// ao browser) e esta protegida por Row Level Security.

const SUPABASE_URL = "https://jikoldwvkkmhkjvibihg.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppa29sZHd2a2ttaGtqdmliaWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Mzg3MjEsImV4cCI6MjA5MTMxNDcyMX0.z9_3edqkZQyPHGh0CSWKQRFlbKXuaQQiQl0EaoUKSPk";

export default async function handler(req, res) {
  const url = `${SUPABASE_URL}/rest/v1/wifi_apartments?select=apt&limit=1`;
  try {
    const r = await fetch(url, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    res.status(200).json({ ok: true, pinged: SUPABASE_URL, status: r.status, at: new Date().toISOString() });
  } catch (err) {
    res.status(200).json({ ok: false, error: String(err), at: new Date().toISOString() });
  }
}
