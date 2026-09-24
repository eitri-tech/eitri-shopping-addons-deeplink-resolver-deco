// Lambda (Node.js 20.x, Function URL) que responde, por página, qual vitrine o site configura:
//   GET https://<function-url>/<host>/<path>.json
// O .decofile tem ~10MB e não pode passar pela ponte nativo -> Eitri-App; aqui ele é lido e recortado sob
// demanda, sem build nem cron.
//
// Variáveis de ambiente:
//   ALLOWED_SITES       hosts aceitos separados por vírgula (ex.: "www.montecarlo.com.br"). Sem ela a função
//                       vira um proxy aberto para o .decofile de qualquer site.
//   REVALIDATE_MINUTES  idade do índice que dispara a atualização em segundo plano (padrão: 5).
//
// Local: ALLOWED_SITES=www.montecarlo.com.br node index.mjs [porta]

import { pathToFileURL } from 'node:url'

const REVALIDATE_MS = (Number(process.env.REVALIDATE_MINUTES) || 5) * 60 * 1000
const MIN_PAGES = 50
const MAX_DEPTH = 40

// Inclui loaders próprios do site (ex.: site/loaders/Product/DiscountFilteredListingPage.ts); prateleiras
// (ProductList) ficam de fora para landing pages não virarem vitrine.
const isListingLoader = type => typeof type === 'string' && /ListingPage\.ts$/i.test(type)

// Precisa bater com toIndexKey do SitePageResolver.js do addon, depois de decodificado.
const normalizePath = value =>
	String(value || '')
		.split(/[?#]/)[0]
		.split('/')
		.map(segment => {
			try {
				return decodeURIComponent(segment).trim().toLowerCase()
			} catch (e) {
				return segment.trim().toLowerCase()
			}
		})
		.filter(Boolean)
		.join('/')

// Seções podem apontar para blocos nomeados (ex.: "PLP Loader") no topo do decofile, e uma página pode ter
// vários loaders de vitrine (variantes/testes A/B com facets vazias): vale o primeiro que tiver facets.
const collectListingLoaders = (decofile, node, found = [], seen = new Set(), depth = 0) => {
	if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return found
	if (Array.isArray(node)) {
		node.forEach(item => collectListingLoaders(decofile, item, found, seen, depth + 1))
		return found
	}
	if (isListingLoader(node.__resolveType) && node.selectedFacets) found.push(node)
	const ref = node.__resolveType
	if (ref && decofile[ref] && !seen.has(ref)) collectListingLoaders(decofile, decofile[ref], found, new Set([...seen, ref]), depth + 1)
	Object.values(node).forEach(value => collectListingLoaders(decofile, value, found, seen, depth + 1))
	return found
}

const validFacets = loader => (Array.isArray(loader?.selectedFacets) ? loader.selectedFacets.filter(f => f?.key && f?.value) : [])
const isWildcard = key => key.includes('*') || key.includes(':')

const buildIndex = decofile => {
	const index = new Map()
	for (const block of Object.values(decofile || {})) {
		if (!block || typeof block !== 'object') continue

		if (block.__resolveType === 'website/loaders/redirect.ts' && block.redirect?.from && block.redirect?.to) {
			const from = normalizePath(block.redirect.from)
			if (from && !isWildcard(from)) index.set(from, { type: 'redirect', to: block.redirect.to })
			continue
		}

		if (block.__resolveType !== 'website/pages/Page.tsx' || !block.path) continue
		const key = normalizePath(block.path)
		// Rotas com curinga (/*, /:slug/p) são genéricas; o resolver do app já trata PDP e categoria.
		// O redirect ganha da página no mesmo path, como no site.
		if (!key || isWildcard(key) || index.get(key)?.type === 'redirect') continue

		const loader = collectListingLoaders(decofile, block.sections).find(l => validFacets(l).length)
		if (!loader) continue
		index.set(key, { type: 'catalog', title: block.name || '', facets: validFacets(loader), ...(loader.sort ? { sort: loader.sort } : {}) })
	}
	return index
}

// Fica fora do handler para sobreviver entre invocações do mesmo container da Lambda.
const sites = new Map()

const downloadIndex = async (host, etag) => {
	const response = await fetch(`https://${host}/.decofile`, {
		headers: { 'user-agent': 'eitri-deeplink-page-resolver', ...(etag ? { 'if-none-match': etag } : {}) }
	})
	if (response.status === 304) return null
	if (!response.ok) throw new Error(`.decofile respondeu ${response.status}`)

	const index = buildIndex(await response.json())
	if (index.size < MIN_PAGES) throw new Error(`índice suspeito (${index.size} páginas)`)
	return { index, etag: response.headers.get('etag') }
}

// Um download por vez por site. O site pode ignorar If-None-Match (a Monte Carlo devolve 200 com os 10MB
// mesmo com o etag certo), então cada revalidação pode custar o download e o parse inteiros.
const refresh = host => {
	const current = sites.get(host)
	if (current?.refreshing) return current.refreshing

	const refreshing = downloadIndex(host, current?.etag)
		.then(result => {
			const next = result ? { ...sites.get(host), ...result } : { ...sites.get(host) }
			sites.set(host, { ...next, error: null, checkedAt: Date.now(), refreshing: null })
			return sites.get(host).index
		})
		.catch(error => {
			console.error(`[${host}]`, error.message)
			// Sem índice bom, a falha também fica em cache pela janela, para não baixar o decofile a cada deeplink.
			sites.set(host, { ...sites.get(host), error: error.message, checkedAt: Date.now(), refreshing: null })
			if (sites.get(host).index) return sites.get(host).index
			throw error
		})
	sites.set(host, { ...current, refreshing })
	return refreshing
}

// Stale-while-revalidate: com um índice em memória, responde na hora e atualiza em segundo plano. O download
// fica pendente enquanto o container congela entre invocações e continua na próxima; o índice antigo segue
// valendo até ele terminar. Só a primeira chamada do container (ou após falha sem índice) espera o download.
const getIndex = async host => {
	const cached = sites.get(host)
	const fresh = cached && Date.now() - cached.checkedAt < REVALIDATE_MS

	if (cached?.index) {
		if (!fresh) refresh(host).catch(() => {})
		return cached.index
	}
	if (cached?.refreshing) return cached.refreshing
	if (fresh && cached.error) throw new Error(cached.error)
	return refresh(host)
}

const reply = (statusCode, body, maxAge) => ({
	statusCode,
	headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${maxAge}` },
	body: JSON.stringify(body)
})

const allowedSites = () =>
	String(process.env.ALLOWED_SITES || '')
		.split(',')
		.map(h => h.trim().toLowerCase())
		.filter(Boolean)

// Evento da Function URL (payload 2.0): rawPath "/www.loja.com.br/joias/colecao/bossa.json".
export const handler = async event => {
	const method = event?.requestContext?.http?.method || 'GET'
	if (method !== 'GET') return reply(405, { error: 'method not allowed' }, 0)

	const allowed = allowedSites()
	const [host, ...rest] = String(event?.rawPath || '/').replace(/^\/+/, '').split('/')
	if (!host || !allowed.includes(host.toLowerCase())) {
		const hint = allowed.length ? `sites liberados: ${allowed.join(', ')}` : 'ALLOWED_SITES não configurada'
		return reply(403, { error: `site não permitido (${hint})` }, 0)
	}

	const key = normalizePath(rest.join('/').replace(/\.json$/i, ''))
	if (!key) return reply(400, { error: `informe o path da página: /${host}/<path>.json` }, 0)

	try {
		const entry = (await getIndex(host.toLowerCase())).get(key)
		return entry ? reply(200, entry, 300) : reply(404, { error: 'not found' }, 60)
	} catch (error) {
		return reply(502, { error: 'site indisponível' }, 0)
	}
}

// Servidor local só quando executado direto (node index.mjs); na Lambda o runtime importa o módulo.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const { createServer } = await import('node:http')
	const port = Number(process.argv[2] || 8787)
	createServer(async (req, res) => {
		const response = await handler({ rawPath: new URL(req.url, 'http://localhost').pathname, requestContext: { http: { method: req.method } } })
		res.writeHead(response.statusCode, response.headers)
		res.end(response.body)
	}).listen(port, () => {
		const sites = allowedSites()
		if (!sites.length) console.warn('ALLOWED_SITES vazia: toda requisição vai responder 403.')
		else console.log(`ex.: http://localhost:${port}/${sites[0]}/joias/colecao/bossa.json`)
	})
}
