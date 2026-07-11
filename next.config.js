/** @type {import('next').NextConfig} */
const nextConfig = {
	output: 'standalone',
	webpack: (config, { dev }) => {
		if (dev) {
			config.cache = false
		}
		return config
	},
}

module.exports = nextConfig
