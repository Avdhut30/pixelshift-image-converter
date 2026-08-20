import app from '../server/index.js'

export default function handler(request, response) {
  const apiRoute = Array.isArray(request.query.route) ? request.query.route.join('/') : request.query.route
  const assetRoute = Array.isArray(request.query.asset) ? request.query.asset.join('/') : request.query.asset

  if (apiRoute) request.url = `/api/${apiRoute}`
  else if (assetRoute) request.url = `/ai-assets/${assetRoute}`
  else return response.status(404).json({ error: 'Route not found.' })

  return app(request, response)
}
