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
	const params = new URLSearchParams(queryString || '')
	const utm = {}
	for (const [key, value] of params) {
		if (key.startsWith('utm')) utm[key] = value
	}
	const awc = params.get('awc')
	if (awc) utm.utm_campaign = awc
	return sanitizeUtmParams(utm)
}
