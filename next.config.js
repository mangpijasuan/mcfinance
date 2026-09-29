/** @type {import('next').NextConfig} */
const nextConfig = {
	distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
	turbopack: { root: __dirname },
	async headers() {
		return [
			{
				source: '/:path*',
				headers: [
					{ key: 'X-Frame-Options', value: 'DENY' },
					{ key: 'X-Content-Type-Options', value: 'nosniff' },
					{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
					{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
				],
			},
		]
	},
}

module.exports = nextConfig
