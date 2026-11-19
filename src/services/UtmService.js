// Mesma limpeza que o site aplica às UTMs antes de irem para o pedido
// (decocms/apps-start, vtex/utils/segment.ts): tira o que não é Latin-1 e
// os caracteres / [ ] { } ( ) < > . de source, medium e campaign. Sem isso o
// app grava "n.mvcon.%5BMonteCarlo%5D..." e o site "nmvconMonteCarlo...", e a
// mesma campanha aparece com dois nomes no relatório de pedidos.
const SITE_SANITIZED_KEYS = ['utm_source', 'utm_medium', 'utm_campaign']

const sanitize = value => value.replace(/[^\x00-\xFF]/g, '').replace(/[/[\]{}()<>.]/g, '')

export const sanitizeUtmParams = params => {
	const result = {}
	for (const [key, value] of Object.entries(params || {})) {
		result[key] = SITE_SANITIZED_KEYS.includes(key) && typeof value === 'string' ? sanitize(value) : value
	}
	return result
}

// Lê as UTMs da query do link já decodificadas (%5B → [, + → espaço), como o
// navegador faz no site. O awc da Awin vira utm_campaign (formato esperado pelo
// checkout em awinService.js).
export const extractUtmParams = queryString => {
	const params = new URLSearchParams((queryString || '').split('#')[0])
	const utm = {}
	for (const [key, value] of params) {
		if (key.startsWith('utm')) utm[key] = value
	}
	const awc = params.get('awc')
	if (awc) utm.utm_campaign = awc
	return sanitizeUtmParams(utm)
}

// ---------------------------------------------------------------------------
// Origem (referrer) → UTMi Part, com a mesma regra do site
// (deco-sites/montecarlo-tanstack, src/sdk/originAttribution.ts):
// - só vale origem http(s) externa; montecarlo.com.br e subdomínios são internos;
// - entrada por campanha (utm_source, gclid ou gbraid) descarta a origem
//   guardada e recalcula a partir do referrer dessa entrada;
// - fora isso, a origem guardada e ainda válida é preservada (first-touch);
// - a validade de 30 dias vem do getUtmParams do vtex-shared (saveAt).
// Grava como utmi_part: o vtex-shared guarda como utm_ipart e manda utmIpart no
// marketingData; a VTEX não diferencia maiúsculas e o último campo vence, então
// vira utmiPart no pedido (testado na API de checkout).
const CAMPAIGN_ENTRY_KEYS = ['utm_source', 'gclid', 'gbraid']

export const isExternalOrigin = url => {
	if (!url) return false
	try {
		const { protocol, hostname } = new URL(url)
		const isInternal = hostname === 'montecarlo.com.br' || hostname.endsWith('.montecarlo.com.br')
		return (protocol === 'http:' || protocol === 'https:') && !isInternal
	} catch (_e) {
		return false
	}
}

// O Android entrega o referrer de app como android-app://<pacote>/<esquema>/<host>
// (ex.: app do Google); vira a URL web equivalente.
export const normalizeReferrer = value => {
	const raw = typeof value === 'string' ? value : value?.referrer ?? value?.url
	if (!raw) return null
	const appReferrer = /^android-app:\/\/[^/]+\/(https?)\/(.+)$/.exec(raw)
	const url = appReferrer ? `${appReferrer[1]}://${appReferrer[2]}` : raw
	try {
		return new URL(url).href
	} catch (_e) {
		return url
	}
}

// Devolve o que salvar no storage de UTMs, ou null quando nada muda.
export const nextUtmParams = ({ queryString, referrer, stored = {} }) => {
	const utm = extractUtmParams(queryString)
	const params = new URLSearchParams((queryString || '').split('#')[0])
	const isCampaignEntry = CAMPAIGN_ENTRY_KEYS.some(key => params.get(key))
	const storedPart = stored.utm_ipart ?? null
	const origin = normalizeReferrer(referrer)

	const utmiPart =
		!isCampaignEntry && isExternalOrigin(storedPart) ? storedPart : isExternalOrigin(origin) ? origin : null

	// utmi_part só entra quando há origem ou é preciso limpar uma guardada: a
	// chave sobra no marketingData e, enquanto existir, faz o vtex-shared
	// reenviar o attachment a cada carga do carrinho.
	const part = utmiPart || storedPart ? { utmi_part: utmiPart } : {}

	if (Object.keys(utm).length) return { ...utm, ...part }
	if (utmiPart === storedPart) return null
	// Sem UTM no link, grava só a origem: regravar as UTMs guardadas renovaria o
	// saveAt e estenderia a campanha antiga por mais 30 dias (crmback ⟵ google).
	return part
}
