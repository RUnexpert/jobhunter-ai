const resources: Record<string, string[]> = {
  '/auth/register': ['post'],
  '/auth/login': ['post'],
  '/auth/logout': ['post'],
  '/me': ['get'],
  '/dashboard': ['get'],
  '/analytics': ['get'],
  '/analytics/recommendations': ['post'],
  '/search-profiles': ['get', 'post'],
  '/search-profiles/{id}': ['patch'],
  '/import-search': ['post'],
  '/resumes': ['get', 'post'],
  '/resumes/{id}': ['patch'],
  '/candidate': ['get', 'put'],
  '/applications': ['get'],
  '/vacancies': ['get'],
  '/applications/{id}/{action}': ['post'],
  '/tasks': ['get'],
  '/tasks/{id}': ['patch'],
  '/activity': ['get'],
  '/notifications': ['get'],
  '/providers': ['get', 'put'],
  '/providers/test': ['post'],
  '/settings': ['get', 'put'],
  '/agent': ['post'],
  '/hh/disconnect': ['post'],
  '/export': ['get'],
  '/events': ['get'],
  '/health': ['get'],
};
export const spec = {
  openapi: '3.0.3',
  info: {
    title: 'JobHunter AI API',
    version: '1.0.0',
    description:
      'Cookie session authentication. Mutations require Origin matching APP_URL. See docs/API.md for request bodies. No applicant submission endpoint is invoked.',
  },
  servers: [{ url: '/api' }],
  security: [{ session: [] }],
  components: {
    securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'jh_session' } },
    schemas: { Error: { type: 'object', properties: { error: { type: 'string' } } } },
  },
  paths: Object.fromEntries(
    Object.entries(resources).map(([path, methods]) => [
      path,
      Object.fromEntries(
        methods.map((method) => [
          method,
          {
            summary: `${method.toUpperCase()} ${path}`,
            ...(['/auth/register', '/auth/login', '/health'].includes(path)
              ? { security: [] }
              : {}),
            ...(['post', 'put', 'patch'].includes(method)
              ? {
                  requestBody: {
                    required: true,
                    content: {
                      'application/json': {
                        schema: { type: 'object', additionalProperties: true },
                        examples: {
                          request: {
                            value:
                              path === '/agent'
                                ? { action: 'START' }
                                : path === '/auth/login'
                                  ? { email: 'you@example.com', password: 'your-password' }
                                  : path === '/applications/{id}/{action}'
                                    ? { confirmed: true }
                                    : {},
                          },
                        },
                      },
                    },
                  },
                }
              : {}),
            parameters: [
              ...(path.includes('{id}')
                ? [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]
                : []),
              ...(path.includes('{action}')
                ? [
                    {
                      name: 'action',
                      in: 'path',
                      required: true,
                      schema: {
                        type: 'string',
                        enum: [
                          'confirm',
                          'retry',
                          'skip',
                          'letter',
                          'question',
                          'feedback',
                          'pipeline',
                          'blacklist',
                        ],
                      },
                    },
                  ]
                : []),
            ],
            responses: {
              200: { description: 'Success' },
              400: { description: 'Validation error' },
              401: { description: 'Session required' },
              403: { description: 'Origin or permissions rejected' },
            },
          },
        ]),
      ),
    ]),
  ),
};
