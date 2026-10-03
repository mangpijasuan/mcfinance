/** @type {import('next').NextConfig} */
const nextConfig = {
	distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
	turbopack: { root: __dirname },
	// The Next.js dev badge sat over the sidebar's "Sign out" link. Errors
	// still show in development; production builds never include it.
	devIndicators: false,
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
