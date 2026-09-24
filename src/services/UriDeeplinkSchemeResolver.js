import { getProductById, getProductBySlug } from './ProductService'
import { openBrowser, openEitriApp, openProduct, openLandingPage, closeEitriApp } from './NavigationService'
import Eitri from 'eitri-bifrost'
import { resolveDeeplinkFromRemoteConfig, landingPageExistsInCms } from './DeeplinkResolver'
import { delay } from './UtilService'

const resolveDeeplinkToProduct = async deeplink => {
	try {
		let product = null

		if (deeplink?.startsWith('product/id')) {
			const productId = deeplink.split('product/id/')[1]
			product = await getProductById(productId)
		}

		if (deeplink?.startsWith('product/slug')) {
			const productSlug = deeplink.split('product/slug/')[1]
			const _product = await getProductBySlug(productSlug)
			product = _product?.[0]
		}

		if (product) {
			openProduct(product)
			return true
		}

		return false
	} catch (error) {
		console.error('Erro ao processar o deep link do produto', error)
		return false
	}
}

const resolveCollection = async (deeplink, params) => {
	try {
		if (deeplink?.startsWith('collection')) {
			const paramsObj = Object.fromEntries(new URLSearchParams(params))
			const payload = {
				facets: [{ key: 'productClusterIds', value: paramsObj?.filter || paramsObj?.filters }],
				sort: paramsObj?.O || paramsObj?.order,
			}
			openEitriApp('home', {
				route: 'ProductCatalog',
				...payload,
				params: payload
			})
			return true
		}

		return false
	} catch (error) {
		console.error('Erro ao processar o deep link do produto', error)
		return false
	}
}

const resolveCategory = async (deeplink, params) => {
	if (!deeplink) return false

	if (!deeplink?.startsWith('category')) {
		return
	}

	const categories = deeplink.replace('category/', '').split('/')
	const facets = categories.map((category, index) => ({
		key: `category-${index + 1}`,
		value: category
	}))
	if (!facets) return false

	const paramsObj = Object.fromEntries(new URLSearchParams(params))
	const payload = {
		facets,
		sort: paramsObj?.O || paramsObj?.order || '',
		filter: params
	}
	openEitriApp('home', {
		route: 'ProductCatalog',
		...payload,
		params: payload
	})
	return true
}

const resolveLandingPage = async (deeplink, params) => {
	try {
		const _deeplink = deeplink?.split('/')?.[0]?.toLowerCase()?.replace(/[^a-zA-ZÀ-ÿ]/g, '')
		if (_deeplink === 'landingpage') {
			const paramsObj = Object.fromEntries(new URLSearchParams(params))
			const title = paramsObj?.title || ""
			// mantém o path completo após o prefixo (ex: landingpage/especial/cliente-a -> especial/cliente-a)
			const lpname = deeplink?.replace(/^[^/]+\//, '')
			openLandingPage(title, lpname)
			return true
		}
	} catch (error) {
		console.error('Erro ao processar o deep link do produto', error)
		return false
	}
}

const resolveWebView = async (deeplink, params) => {
	if (!deeplink) return false

	if (!deeplink.startsWith('webview')) {
		return false
	}

	if (deeplink.startsWith('webview/inapp/')) {
		const url = deeplink.replace(/^webview\/inapp\//i, '')
		openBrowser(`${decodeURIComponent(url)}${params ? '?'+params : ''}`, true)
	} else {
		const url = deeplink.replace(/^webview\//i, '')
		openBrowser(`${decodeURIComponent(url)}${params ? '?'+params : ''}`, false)
	}
	return true
}

const resolveSearch = async (deeplink, params) => {
	if (!deeplink) return false

	if (!deeplink.startsWith('search')) {
		return false
	}

	const term = deeplink.split('search/')[1]
	const paramsObj = Object.fromEntries(new URLSearchParams(params))
	const payload = {
		searchTerm: term,
		sort: paramsObj?.O || paramsObj?.order,
		filter: params
	}
	openEitriApp('home', {
		route: 'Search',
		...payload,
		params: payload
	})
	return true
}

const resolveGeneric = async (deeplink, params) => {
	if (!deeplink) return false

	if (/^home(?:\/.*)?$/i.test(deeplink)) {
		closeEitriApp()
		return true
	}

	if (/^cart(?:\/.*)?$/i.test(deeplink)) {
		const cartId = deeplink.split('cart/')[1]
		openEitriApp('cart', {
			cartId: cartId
		})
		return true
	}

	if (/^account(?:\/.*)?$/i.test(deeplink)) {
		const viewName = deeplink.split('account/')[1]
		openEitriApp('account', {
			route: viewName || ''
		})
		return true
	}
	
	return false
}

// Landing page enviada sem o prefixo "landingpage/" (ex: scheme://especial/cliente-a):
// último recurso antes de fechar o app — valida a existência no CMS antes de abrir,
// mesmo padrão das URLs http; sem match no CMS, segue o pipeline (closeEitriApp)
const resolveCmsLandingPage = async (deeplink, params) => {
	if (!deeplink) return false

	const lpname = deeplink.replace(/^\//, '').replace(/\/$/, '')
	if (!lpname) return false

	const exists = await landingPageExistsInCms(lpname)
	if (!exists) return false

	const paramsObj = Object.fromEntries(new URLSearchParams(params))
	openLandingPage(paramsObj?.title || '', lpname)
	return true
}

export const resolveUriDeeplinkScheme = async deeplink => {
	const [, basePath] = deeplink.split('://')
	const [path, queryParams] = basePath.split(/\?(.*)/).filter(Boolean)
	const deeplinkWays = [
		resolveGeneric,
		resolveDeeplinkFromRemoteConfig,
		resolveDeeplinkToProduct,
		resolveCollection,
		resolveCategory,
		resolveWebView,
		resolveSearch,
		resolveLandingPage,
		resolveCmsLandingPage
	]

	try {
		for (const way of deeplinkWays) {
			try {
				
				// console.log('executando:', way.name)
				
				let result = await way(path, queryParams)
				if (result) {
					return true
				}
			} catch (error) {
				console.error('Erro ao processar o deep link', way.name, error)
			}
		}
		closeEitriApp()
	} catch (error) {
		console.error('Erro ao processar o deep link', error)
		closeEitriApp()
	}
}
