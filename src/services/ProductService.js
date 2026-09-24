import { Vtex } from 'eitri-shopping-vtex-shared'

export const getProductBySlug = async slug => {
	return await Vtex.catalog.getProductBySlug(slug)
}

export const getProductById = async id => {
	return await Vtex.catalog.getProductById(id)
}
