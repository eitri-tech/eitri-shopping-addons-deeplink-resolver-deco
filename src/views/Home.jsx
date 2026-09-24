import Eitri from 'eitri-bifrost'
import { App, Vtex } from 'eitri-shopping-vtex-shared'
import { deeplinkActionsExecutor } from '../services/NotificationDeepLinkService'
import { resolveDeeplinkPath } from '../services/DeeplinkResolver'
import { resolveUriDeeplinkScheme } from '../services/UriDeeplinkSchemeResolver'
import { closeEitriApp } from '@/services/NavigationService'

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
		await saveUtmParams(utmParams)
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
		if (!queryParams) return
		const paramsArray = queryParams.split('&')
		const paramsObject = {}
		paramsArray?.forEach(param => {
			const [key, value] = param.split('=')
			if (key.startsWith('utm')) {
				paramsObject[key] = value
			}
		})

		const awinParam = paramsArray?.find(k => k.startsWith("awc="))
		if (awinParam) {
			const awc = awinParam.split('=')[1]
			paramsObject.utm_campaign = awc
		}

		await saveUtmParams(paramsObject)
	}

	const saveUtmParams = async params => {
		return Vtex.customer.saveUtmParams(params)
	}

	return (
		<Page>
            <Text>...</Text>
		</Page>
	)
}
