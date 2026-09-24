#!/usr/bin/env node
// Sorteia páginas do .decofile do site e abre cada uma como deeplink no device via adb.
//
//   node scripts/open-random-deeplinks.mjs [--count 10] [--site www.montecarlo.com.br]
//     [--package br.com.montecarlo.eitri] [--serial <adb serial>] [--interval <segundos>] [--all]
//
// Sem --interval, espera Enter entre um deeplink e outro. Por padrão só sorteia páginas com vitrine
// (as que a Lambda resolve); --all inclui institucionais e landing pages.

import { execFileSync } from 'node:child_process'
import readline from 'node:readline/promises'

const args = process.argv.slice(2)
const flag = name => args.includes(`--${name}`)
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`)
	return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const site = option('site', 'www.montecarlo.com.br')
const pkg = option('package', 'br.com.montecarlo.eitri')
const serial = option('serial', '')
const count = Number(option('count', 10))
const interval = Number(option('interval', 0))

const adb = (...cmd) => execFileSync('adb', [...(serial ? ['-s', serial] : []), ...cmd], { encoding: 'utf8' })

const hasListingLoader = node => {
	if (!node || typeof node !== 'object') return false
	if (typeof node.__resolveType === 'string' && node.__resolveType.endsWith('ListingPage.ts')) return true
	return Object.values(node).some(hasListingLoader)
}

const loadPaths = async () => {
	const response = await fetch(`https://${site}/.decofile`)
	if (!response.ok) throw new Error(`.decofile respondeu ${response.status}`)
	const decofile = await response.json()

	const paths = new Set()
	for (const block of Object.values(decofile)) {
		if (block?.__resolveType !== 'website/pages/Page.tsx' || typeof block.path !== 'string') continue
		const path = block.path.trim()
		if (!path || path === '/' || /[*:]/.test(path)) continue
		// Loaders referenciados por nome (ex.: "PLP Loader") ficam no topo do decofile, não na página.
		const sections = JSON.stringify(block.sections ?? [])
		const refsListing = [...sections.matchAll(/"__resolveType":"([^"]+)"/g)].some(([, ref]) => hasListingLoader(decofile[ref]))
		if (flag('all') || hasListingLoader(block.sections) || refsListing) paths.add(path)
	}
	return [...paths]
}

const pickRandom = (list, n) => {
	const copy = [...list]
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[copy[i], copy[j]] = [copy[j], copy[i]]
	}
	return copy.slice(0, n)
}

const main = async () => {
	const devices = adb('devices').split('\n').slice(1).filter(line => /\tdevice$/.test(line))
	if (!devices.length) throw new Error('nenhum device conectado no adb')
	if (devices.length > 1 && !serial) throw new Error('mais de um device conectado, informe --serial')

	console.log(`Baixando .decofile de ${site}...`)
	const paths = await loadPaths()
	const picked = pickRandom(paths, count)
	console.log(`${paths.length} páginas encontradas, abrindo ${picked.length} em ${pkg}\n`)

	const rl = interval ? null : readline.createInterface({ input: process.stdin, output: process.stdout })
	for (const [i, path] of picked.entries()) {
		const url = `https://${site}${encodeURI(path)}`
		console.log(`[${i + 1}/${picked.length}] ${url}`)
		adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`, '-p', pkg)
		if (i === picked.length - 1) break
		if (rl) await rl.question('  Enter para o próximo...')
		else await new Promise(resolve => setTimeout(resolve, interval * 1000))
	}
	rl?.close()
}

main().catch(error => {
	console.error(error.message)
	process.exit(1)
})
