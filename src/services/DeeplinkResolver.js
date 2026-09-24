import Eitri from 'eitri-bifrost'
import { App, Vtex } from 'eitri-shopping-vtex-shared'
import {
	closeEitriApp,
	openEitriApp,
	openHome,
	openLandingPage,
	openProductBySlug,
	openRedirectLinkBrowser,
	openWebFlow
} from './NavigationService'
import { delay } from './UtilService'

const resolveDeeplinkRoot = deeplink => {
	console.log('resolveDeeplinkRoot')
	const [baseUrl] = deeplink.split('?')
	const baseDomain = App?.configs?.providerInfo?.domain || App?.configs?.providerInfo?.host
	const domain = baseDomain?.replace(/^https?:\/\//, "")?.replace(/\/$/, "")
	if (!domain) return false

	const isRoot = new RegExp(`^https?:\/\/${domain}\/?$`).test(baseUrl)

	if (isRoot) {
		Eitri.exposedApis.appState.goHome()
		return true
	}
	return false
}

const resolveDeeplinkToProduct = async deeplink => {
	try {
		console.log('resolveDeeplinkToProduct')
		const [baseUrl] = deeplink.split('?')

		if (baseUrl.toLowerCase().endsWith('/p')) {
			const urlParts = baseUrl.split('/')
			const productSlug = urlParts[urlParts.length - 2]
			if (productSlug) {
				await openProductBySlug(productSlug)
				return true
			}
		}
		return false
	} catch (error) {
		console.error('Erro ao processar o deep link do produto', error)
		return false
	}
}

const resolveDeeplinkToProductCatalog = deeplink => {
	console.log('resolveDeeplinkToProductCatalog')
	if (!deeplink) return false

	deeplink = deeplink.replace(/^https?:\/\//, "").replace(/^www\./, "")
	const host = App?.configs?.providerInfo?.host || App?.configs?.providerInfo?.domain // domain is deprecated
	const domain = host?.replace(/^https?:\/\//, "")?.replace(/^www\./, "")?.replace(/\/$/, "")

	const [baseUrl, queryParams] = deeplink.split('?')

	try {
		if (deeplink?.includes('&map=') || deeplink?.includes('?map=')) {
			const paramsArray = queryParams.split('&')

			const paramsObject = {}
			let mapValues = []

			paramsArray.forEach(param => {
				const [key, value] = param.split('=')
				if (key === 'map') {
					mapValues = decodeURIComponent(value).split(',')
				} else {
					paramsObject[key] = value
				}
			})

			if (mapValues.length > 0) {
				if (!domain) return false
				const pathSegments = baseUrl
					.replace(new RegExp(`^${domain}\/?`), '')
					.split('#')[0]
					.split('/')

				const facets = mapValues.map((mapValue, index) => ({
					key: mapValue,
					value: pathSegments[index] || ''
				}))
				openHome({ deeplinkFacets: facets })
				return true
			}
		}

		if (deeplink?.includes('filter')) {
			const paramsArray = queryParams.split('&')
			let facets = []

			paramsArray.forEach(param => {
				if (param.startsWith('filter.')) {
					const [keyWithFilter, value] = param.split('=')
					const key = keyWithFilter.replace('filter.', '')
					facets.push({
						key: key,
						value: decodeURIComponent(value)
					})
				}
			})

			let sort = ''

			if (deeplink?.includes('sort')) {
				const sortMatch = deeplink?.match(/sort=([^&]*)/)
				sort = sortMatch ? decodeURIComponent(sortMatch[1]) : ''
			}

			if (facets.length > 0) {
				openHome({ deeplinkFacets: facets, sort })
				return true
			}
		}

		if (!domain) return false

		const path = deeplink.replace(new RegExp(`^${domain}\/?`), '')
		
		const [categoryPath] = path.split('?')
		if (!categoryPath) return false

		const categories = categoryPath.split("/").filter(Boolean);
		if (!categories) return false

		const facets = categories.map((category, index) => ({
			key: `category-${index + 1}`,
			value: category
		}))
		if (!facets) return false
		openEitriApp('home', { params: { facets }, route: 'ProductCatalog' })
		return true
	} catch (error) {
		console.error('Erro ao processar o deep link de busca', error)
		return false
	}
}

const resolveStoreLinks = deeplink => {
	console.log('resolveStoreLinks')
	if (deeplink.includes('play.google') || deeplink.includes('app.apple')) {
		closeEitriApp()
		return true
	}
	return false
}

export const resolveDeeplinkFromRemoteConfig = deeplink => {
	console.log('resolveDeeplinkFromRemoteConfig')
	const rcDeeplinkConfig = App?.configs?.deeplink
	if (!rcDeeplinkConfig?.deeplinkMap) {
		return false
	}

	const matchedDeeplink = rcDeeplinkConfig.deeplinkMap.find(dlinkMap => {
		return dlinkMap.path.some(path => deeplink.indexOf(path) > -1)
	})

	if (matchedDeeplink) {
		if (matchedDeeplink?.forceWeb) {
			if (matchedDeeplink.forceWeb === true) {
				openRedirectLinkBrowser(deeplink)
			} else {
				openWebFlow(matchedDeeplink.forceWeb)
			}
			return true
		}

		openEitriApp(matchedDeeplink.slug, { deeplink, ...matchedDeeplink.params })
		return true
	} else {
		return false
	}
}

// Landing page por URL do site (ex: https://www.loja.com.br/especial/cliente-a):
// extrai o path da rota e consulta o CMS para saber se existe uma landing page com esse
// nome — tenta "especial/cliente-a" e "/especial/cliente-a", mesmo padrão da view LandingPage.
const resolveDeeplinkLandingPage = async deeplink => {
	try {
		console.log('resolveDeeplinkLandingPage')
		const [baseUrl] = deeplink.split('?')
		const host = App?.configs?.providerInfo?.host || App?.configs?.providerInfo?.domain
		const domain = host?.replace(/^https?:\/\//, '')?.replace(/^www\./, '')?.replace(/\/$/, '')
		if (!domain) return false

		const lpname = baseUrl
			.replace(/^https?:\/\//, '')
			.replace(/^www\./, '')
			.replace(new RegExp(`^${domain}`), '')
			.split('#')[0]
			.replace(/^\//, '')
			.replace(/\/$/, '')
		if (!lpname) return false

		const exists = await landingPageExistsInCms(lpname)
		if (!exists) return false

		openLandingPage('', lpname)
		return true
	} catch (error) {
		console.error('Erro ao processar o deep link de landing page', error)
		return false
	}
}

export const landingPageExistsInCms = async pageName => {
	const { faststore } = Vtex?.configs || {}
	if (!faststore || !pageName) return false

	for (const name of [pageName, `/${pageName}`]) {
		const result = await Vtex.cms.getPagesByContentTypes(faststore, 'landingPage', { 'filters[name]': name })
		if (result?.data?.length > 0) return true
	}

	return false
}

export const resolveDeeplinkPath = async deeplink => {
	const deeplinkWays = [
		resolveStoreLinks,
		resolveDeeplinkRoot,
		resolveDeeplinkToProduct,
		resolveDeeplinkFromRemoteConfig,
		resolveDeeplinkLandingPage,
		resolveDeeplinkToProductCatalog,
		openRedirectLinkBrowser
	]

	try {
		for (const way of deeplinkWays) {
			try {
				let result = await way(deeplink)
				if (result) {
					return true
				}
			} catch (error) {
				console.error('Erro ao processar o deep link', error)
			}
		}
		closeEitriApp()
	} catch (error) {
		console.error('Erro ao processar o deep link', error)
		closeEitriApp()
	}
}
