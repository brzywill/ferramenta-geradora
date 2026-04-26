export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    clientName, reportType, period, previousPeriod, profile,
    meta, metaPrev, google, googlePrev, keywords,
    metaCampaigns, googleCampaigns
  } = req.body || {};

  const fmt = (v, type) => {
    if (v == null || !Number.isFinite(v)) return "—";
    if (type === "cur") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if (type === "pct") return v.toFixed(1) + "%";
    return Math.round(v).toLocaleString("pt-BR");
  };

  const metaCampsList = (metaCampaigns || [])
    .filter(r => r.resultados > 0)
    .map(r => `• ${r.nome} (${r.tipo}): ${Math.round(r.resultados)} resultados, custo/resultado ${r.cpr ? r.cpr.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}`)
    .join("\n");

  const googleCampsList = (googleCampaigns || [])
    .filter(r => r.clicks > 0 || r.cost > 0)
    .map(r => `• ${r.campanha}: ${Math.round(r.clicks)} cliques, ${Math.round(r.conversions)} conversões, custo ${r.cost ? r.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}`)
    .join("\n");

  const kwList = (keywords || [])
    .slice(0, 5)
    .map(k => `• "${k.kw}": ${Math.round(k.clicks)} cliques, CTR ${k.ctr?.toFixed(1)}%, CPC ${k.cpc ? k.cpc.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}`)
    .join("\n");

  const prompt = `Você é um analista sênior de tráfego pago. Analise os dados abaixo e retorne APENAS um JSON válido, sem texto extra, sem markdown, sem blocos de código.

CLIENTE: ${clientName}
TIPO DE RELATÓRIO: ${reportType}
PERÍODO ATUAL: ${period}
PERÍODO ANTERIOR: ${previousPeriod}
PERFIL DA CONTA: ${profile}

--- META ADS ---
Investimento: ${fmt(meta?.investimento, "cur")} (anterior: ${fmt(metaPrev?.investimento, "cur")})
Conversas: ${fmt(meta?.conversas)} (anterior: ${fmt(metaPrev?.conversas)})
Custo/Conversa: ${fmt(meta?.custo_conversa, "cur")} (anterior: ${fmt(metaPrev?.custo_conversa, "cur")})
Seguidores: ${fmt(meta?.seguidores)} (anterior: ${fmt(metaPrev?.seguidores)})
Custo/Seguidor: ${fmt(meta?.custo_seguidor, "cur")} (anterior: ${fmt(metaPrev?.custo_seguidor, "cur")})
Visitas ao Perfil: ${fmt(meta?.visitas)} (anterior: ${fmt(metaPrev?.visitas)})
Compras: ${fmt(meta?.compras)} (anterior: ${fmt(metaPrev?.compras)})
ROAS: ${meta?.roas?.toFixed(2) || "—"} (anterior: ${metaPrev?.roas?.toFixed(2) || "—"})
Alcance: ${fmt(meta?.alcance)} (anterior: ${fmt(metaPrev?.alcance)})
Frequência: ${meta?.frequencia?.toFixed(2) || "—"} (anterior: ${metaPrev?.frequencia?.toFixed(2) || "—"})
CTR: ${fmt(meta?.ctr, "pct")} (anterior: ${fmt(metaPrev?.ctr, "pct")})

CONJUNTOS/CAMPANHAS META que rodaram no período:
${metaCampsList || "Não informado"}

--- GOOGLE ADS ---
${google ? `Custo: ${fmt(google?.cost, "cur")} (anterior: ${fmt(googlePrev?.cost, "cur")})
Cliques: ${fmt(google?.clicks)} (anterior: ${fmt(googlePrev?.clicks)})
Conversões: ${fmt(google?.conversions)} (anterior: ${fmt(googlePrev?.conversions)})
Custo/Conv.: ${fmt(google?.costPerConversion, "cur")} (anterior: ${fmt(googlePrev?.costPerConversion, "cur")})
CTR: ${fmt(google?.ctr, "pct")} (anterior: ${fmt(googlePrev?.ctr, "pct")})

CAMPANHAS GOOGLE que rodaram no período:
${googleCampsList || "Não informado"}

TOP PALAVRAS-CHAVE:
${kwList || "Não informado"}` : "Google Ads não utilizado neste período."}

Retorne APENAS este JSON, sem nenhum texto antes ou depois:
{
  "pontos_positivos": ["frase 1", "frase 2", "frase 3"],
  "pontos_de_atencao": ["frase 1", "frase 2", "frase 3"],
  "proximos_passos": ["frase 1", "frase 2", "frase 3"],
  "contexto_meta": "Parágrafo único de 2-3 frases descrevendo quais conjuntos/campanhas Meta rodaram, seus objetivos e destaques de resultado. Escreva como um gestor de tráfego falaria para o cliente, sem jargões técnicos desnecessários.",
  "contexto_google": "${google ? 'Parágrafo único de 2-3 frases descrevendo quais campanhas Google rodaram, seus objetivos e destaques. Se não houver dados Google, retorne string vazia.' : ''}"
}

Regras:
- Cada item dos arrays deve ter uma frase completa e direta, baseada nos números acima
- Use valores reais do relatório nas frases, não genéricos
- contexto_meta e contexto_google devem ser texto corrido, não lista
- Se google não foi usado, contexto_google deve ser ""
- Responda SOMENTE com o JSON, sem markdown`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1200 }
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      return res.status(502).json({ error: "Gemini error", detail: err });
    }

    const geminiData = await geminiRes.json();
    let raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    raw = raw.replace(/```json|```/g, "").trim();

    const parsed = JSON.parse(raw);
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: "Falha ao processar resposta da IA", detail: e.message });
  }
}
