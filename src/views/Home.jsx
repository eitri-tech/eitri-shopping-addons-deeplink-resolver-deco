import Eitri from 'eitri-bifrost'
import { App, Vtex } from 'eitri-shopping-vtex-shared'
import { deeplinkActionsExecutor } from '../services/NotificationDeepLinkService'
import { resolveDeeplinkPath } from '../services/DeeplinkResolver'
import { resolveUriDeeplinkScheme } from '../services/UriDeeplinkSchemeResolver'
import { closeEitriApp } from '@/services/NavigationService'
import { nextUtmParams, sanitizeUtmParams } from '../services/UtmService'

export default function Home(props) {
	useEffect(() => {
		startHome()
	}, [])

	const startHome = async () => {
		await loadConfigs()
		await resolveContent()
	}

	const loadConfigs = async () => {
		try {
			await App.tryAutoConfigure({ verbose: false })
		} catch (error) {
			console.error('Erro ao buscar configurações', error)
		}
	}

	const resolveContent = async () => {
		try {
			const startParams = await Eitri.getInitializationInfos()

			if (!startParams) {
				closeEitriApp()
				return
			}

			await processStartParams(startParams)
		} catch (error) {
			console.error('Erro ao resolver parâmetros de inicialização:', error)
			closeEitriApp()
		}
	}

	async function resolveDeeplinkUtmParams(startParams) {
		const utmParams = Object.fromEntries(Object.entries(startParams).filter(([key]) => key.includes('utm')))
		await saveUtmParams(sanitizeUtmParams(utmParams))
	}

	function processParams(input) {
		const { action, value, title, utm, ...others } = input

		// Concatena os outros parâmetros com &
		const additionalParams = Object.entries(others)
			.map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
			.join('&')

		const finalValue = additionalParams ? `${value}&${additionalParams}` : value

		return {
			...(action && { action }),
			value: finalValue,
			...(utm && { utm }),
			...(title && { title })
		}
	}

	const processStartParams = async startParams => {
		try {
			const { action, value, title, deeplink } = startParams
			if (deeplink) {
				if (deeplink.startsWith('http') || deeplink.startsWith('www')) {
					await resolveDeeplinkStartParams(deeplink)
					return
				} else {
					const queryParams = deeplink.split('?')[1]
					if (queryParams) {
						await resolveUtmParams(queryParams)
					}
					await resolveUriDeeplinkScheme(deeplink)
					return
				}
			}

			if (action && value) {
				await resolveDeeplinkUtmParams(startParams)

				let processedParameters = processParams(startParams)

				deeplinkActionsExecutor({
					action: processedParameters.action,
					value: processedParameters.value,
					title: processedParameters.title || ''
				})
			}

			closeEitriApp()
		} catch (error) {
			console.error('Erro ao processar os parametros de inicializacao', error)
			closeEitriApp()
		}
	}

	const resolveDeeplinkStartParams = async deeplink => {
		const [, queryParams] = deeplink?.split('?')

		try {
			await resolveUtmParams(queryParams)
		} catch (e) {
			console.error('Erro ao salvar os parâmetros UTM', e)
		}

		resolveDeeplinkPath(deeplink)
	}

	const resolveUtmParams = async queryParams => {
		const [referrer, stored] = await Promise.all([getDeeplinkReferrer(), Vtex.customer.getUtmParams()])
		const params = nextUtmParams({ queryString: queryParams, referrer, stored: stored || {} })
		if (params) await saveUtmParams(params)
	}

	// Referrer da abertura do link, exposto pelo app nativo a partir da 1.2.1.
	// Em versões antigas a função não existe e segue sem origem. O timeout evita
	// prender o usuário no "Carregando..." se o nativo não responder.
	const getDeeplinkReferrer = async () => {
		try {
			if (!Eitri.canIUse(28)) return null
			const read = async () => {
				const getReferrer = (await Eitri.modules())?.appState?.getDeeplinkReferrer
				return typeof getReferrer === 'function' ? getReferrer() : null
			}
			const timeout = new Promise(resolve => setTimeout(() => resolve(null), 1500))
			return await Promise.race([read(), timeout])
		} catch (e) {
			console.error('Erro ao obter o referrer do deeplink', e)
			return null
		}
	}

	const saveUtmParams = async params => {
		return Vtex.customer.saveUtmParams(params)
	}

	return (
		<Page className="bg-base-100">
			<View
				width="100vw"
				height="100vh"
				className="flex flex-col items-center justify-center gap-4">
				<Loading className="loading-spinner loading-lg text-primary" />
				<Text className="text-sm text-base-content/60">Carregando...</Text>
			</View>
		</Page>
	)
}
