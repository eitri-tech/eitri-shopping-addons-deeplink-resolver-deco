import Eitri from 'eitri-bifrost'

/**
 * Abre o EitriApp de detalhe do produto
 * @param {(object)} product - produto inteiro.
 */
export const openProduct = async product => {
	try {
		await eitriNavigationOpen({
			slug: 'pdp',
			initParams: { product: product },
			replace: true
		})
	} catch (e) {
		console.error('navigate to PDP: Error', e)
		closeEitriApp()
	}
}

export const openProductBySlug = async slug => {
	try {
		await eitriNavigationOpen({
			slug: 'pdp',
			initParams: { slug },
			replace: true
		})
	} catch (e) {
		console.error('navigate to PDP: Error', e)
		closeEitriApp()
	}
}

function resolveFacets(facet) {
	let query = null

	const facets = facet.filter(item => {
		if (item.key === 'ft') {
			query = item['value']
			return false
		}
		return true
	})

	const normalizedPath = { facets: facets }

	if (query) {
		normalizedPath.query = query
	}

	return normalizedPath
}

/**
 * Abre o EitriApp de home
 */
export const openHome = async deeplink => {
	try {
		let params = {}
		if (deeplink?.deeplinkFacets) {
			params = resolveFacets(deeplink?.deeplinkFacets)
		}

		if (deeplink?.sort) {
			params.sort = deeplink?.sort
		}

		if (deeplink) {
			await eitriNavigationOpen({
				slug: 'home',
				initParams: { params, route: 'ProductCatalog' },
				replace: true
			})
		}
	} catch (e) {
		console.error('navigate to Home: Error', e)
		closeEitriApp()
	}
}

/**
 * Abre o EitriApp de home direcionando para Landing Page
 */
export const openLandingPage = async (title, lpname) => {
	try {
		await eitriNavigationOpen({
			slug: 'home',
			initParams: {
				route: 'LandingPage',
				title: title,
				landingPageName: lpname
			},
			replace: true
		})
	} catch (e) {
		console.error('navigate to Home: Error', e)
		closeEitriApp()
	}
}

export const openCheckout = async () => {
	try {
		await eitriNavigationOpen({
			slug: 'checkout',
			replace: true
		})
	} catch (e) {
		console.error('navigate to Checkout: Error', e)
		closeEitriApp()
	}
}

/**
 * Abre o EitriApp relacionado ao deeplink da push notification
 */

export const normalizePath = path => {
	if (!path || typeof path !== 'string') return { facets: [] }

	let pathComponents = decodeURIComponent(path).split('?')
	let pathData = pathComponents[0].split('/').filter(Boolean)
	let queryParams = new URLSearchParams(pathComponents[1] || '')
	let normalizedData = { facets: [] }

	if (queryParams.has('map')) {
		let mapKeys = queryParams.get('map').split(',')
		pathData.forEach((value, index) => {
			if (mapKeys[index] === 'ft') {
				normalizedData.query = value
			} else {
				normalizedData.facets.push({
					key: mapKeys[index],
					value: value
				})
			}
		})
	}

	let hasFilterInQuery = false
	for (let [key, value] of queryParams.entries()) {
		if (key.startsWith('filter.')) {
			hasFilterInQuery = true
			normalizedData.facets.push({
				key: key.replace('filter.', ''),
				value: value
			})
		} else if (key === 'sort') {
			normalizedData.sort = value
		} else if (key !== 'map') {
			normalizedData[key] = value
		}
	}

	if (!hasFilterInQuery && !queryParams.has('map')) {
		pathData.forEach((value, index) => {
			normalizedData.facets.push({
				key: `category-${index + 1}`,
				value: value
			})
		})
	}

	return normalizedData
}

export const navigateHome = async (facets, title, type) => {
	let initParams

	if (typeof facets === 'string' && facets.includes('?')) {
		const normalize = normalizePath(facets)
		initParams = { facets: normalize?.facets, sort: normalize?.sort, route: 'ProductCatalog', title }
	} else {
		initParams = { facets: [{ key: type, value: facets }], route: 'ProductCatalog', title }
	}

	try {
		await eitriNavigationOpen({
			slug: 'home',
			initParams: initParams,
			replace: true
		})
	} catch (e) {
		console.error('navigate to Home: Error', e)
		closeEitriApp()
	}
}

export const navigateSearch = async value => {
	try {
		await eitriNavigationOpen({
			slug: 'home',
			initParams: { searchTerm: value, route: 'Search' },
			replace: true
		})
	} catch (e) {
		console.error('navigate to Home: Error', e)
		closeEitriApp()
	}
}

export const navigateToCategory = async (category, title) => {
	const normalizedPath = normalizePath(category)
	try {
		await eitriNavigationOpen({
			slug: 'home',
			initParams: { params: normalizedPath, route: 'ProductCatalog', title },
			replace: true
		})
	} catch (e) {
		console.error('navigate to Home: Error', e)
		closeEitriApp()
	}
}

export const openEitriApp = async (slug, params) => {
	try {
		await eitriNavigationOpen({
			slug,
			initParams: params,
			replace: true
		})
	} catch (e) {
		console.error('navigate to Home: Error', e)
		closeEitriApp()
	}
}

export const openRedirectLinkBrowser = async deeplink => {
	try {
		console.log('openRedirectLinkBrowser')
		const { applicationData } = await Eitri.getConfigs()
        let inApp = false

        if (typeof deeplink === 'string' && deeplink.startsWith('webview/inapp/')) { inApp = true }
		let url =
			applicationData.platform === 'ios'
				? deeplink
				: `https://faststore-cms.s3.us-east-1.amazonaws.com/redirect.html?link=${btoa(deeplink || '')}`

		Eitri.openBrowser({
			url: url,
			inApp: inApp
		})
		closeEitriApp()
	} catch (error) {
		console.error('Erro ao processar o deep link de busca', error)
		closeEitriApp()
	}
}


export const openWebFlow = async (url) => {
	try {
		if (!url) closeEitriApp()
		
		const urlDomain = getDomain(url)
		
		await Eitri.webFlow.start({
			"startUrl": url,
			"stopPattern": "/oauth/finish",
			"allowedDomains": [urlDomain]
		})
		
	} catch (error) {
		console.error('Erro ao processar a abertura da url via webflow', error)
		closeEitriApp()
	}
}


export const openBrowser = async (url, inApp = true) => {
	try {
		if (typeof url !== 'string' || !url) return
		// forçar sempre https
		const formatedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    	formatedUrl.protocol = 'https:';
		
		Eitri.openBrowser({
			url: formatedUrl.toString(),
			inApp
		})
		closeEitriApp()
	} catch (error) {
		console.error('Erro ao processar o deep link de busca', error)
		closeEitriApp()
	}
}

export const getDomain = (url) => {
	try {
		const { hostname } = new URL(url)
		return hostname?.toLowerCase()
	} catch (e) {
		return null
	}
}

let appIsOpen = true
// centralizando Eitri.navigation.open, para melhorar debug de codigo
export const eitriNavigationOpen = params => {
	if (appIsOpen) {
		// console.log('eitriNavigationOpen', params)
		return Eitri.navigation.open(params)
	} 
}

// centralizando Eitri.close, correção para condição de corrida
export const closeEitriApp = async () => {
	if (appIsOpen) {
		appIsOpen = false
		await Eitri.close()
	} 
}
