export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY não configurada na Vercel." });
  }

  try {
    const {
      clientName,
      reportType,
      period,
      previousPeriod,
      profile,
      meta,
      metaPrev,
      google,
      googlePrev
    } = req.body || {};

    const prompt = `
Você é um analista sênior de tráfego pago.
Escreva em português do Brasil.
Retorne somente JSON válido.

Objetivo:
Gerar textos para um relatório de performance.

Formato obrigatório:
{
  "pontos_positivos": ["...", "..."],
  "pontos_de_atencao": ["...", "..."],
  "proximos_passos": ["...", "..."]
}

Regras:
- no máximo 2 itens por bloco
- use apenas os dados fornecidos
- não invente números
- positivos e atenção devem ser factuais
- próximos passos devem ser objetivos, úteis e humanos
- escreva de forma natural, clara e profissional
- se faltar dado, simplesmente ignore esse ponto
- não use markdown

Contexto do relatório:
Cliente: ${clientName}
Tipo de relatório: ${reportType}
Período atual: ${period}
Período anterior: ${previousPeriod}
Perfil da conta: ${profile}

Meta atual:
${JSON.stringify(meta, null, 2)}

Meta anterior:
${JSON.stringify(metaPrev, null, 2)}

Google atual:
${JSON.stringify(google, null, 2)}

Google anterior:
${JSON.stringify(googlePrev, null, 2)}
`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ]
      })
    });

    const json = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: "Falha ao chamar o Gemini.",
        detail: json?.error?.message || "Erro desconhecido"
      });
    }

    const text = json?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("") || "";
    const parsed = JSON.parse(text);

    return res.status(200).json({
      pontos_positivos: Array.isArray(parsed.pontos_positivos) ? parsed.pontos_positivos : [],
      pontos_de_atencao: Array.isArray(parsed.pontos_de_atencao) ? parsed.pontos_de_atencao : [],
      proximos_passos: Array.isArray(parsed.proximos_passos) ? parsed.proximos_passos : []
    });
  } catch (error) {
    return res.status(500).json({
      error: "Falha ao gerar análise",
      detail: error.message
    });
  }
}
