import { libx } from 'libx.js/build/bundles/essentials.js';
import { Route, Router, RouterType, error, json, cors, withParams, IRequest, text, ResponseHandler } from 'itty-router';
import { createServerAdapter } from '@whatwg-node/server';

type BaseRouterInitializer = (string) => { base: string; router: RouterType<IRequest, any[]> };
type CorsOptions = Parameters<typeof cors>[0];

export class RouterWrapper<TCtx = any> {
	private cors: ReturnType<typeof cors>;
	private preflight: (request: Request) => Response | Promise<Response>;
	private corsify: (response: Response, request: Request) => Response | Promise<Response>;

	public constructor(
		public base: string,
		public router: RouterType<Request, [], any>,
		corsOptions?: CorsOptions
	) {
		this.cors = cors(corsOptions ?? {
			origin: '*',
			allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
			allowHeaders: ['Content-Type', 'Authorization'],
			exposeHeaders: ['Content-Type', 'Authorization'],
		});
		this.preflight = this.cors.preflight;
		this.corsify = this.cors.corsify;
	}

	public static getNew(base: string, corsOptions?: CorsOptions) {
		const temp = new RouterWrapper(base, Router({ base }), corsOptions);
		const router = Router({
			base,
			before: [temp.preflight],
			catch: RouterWrapper.errorHandler,
		});
		router.all('*', withParams);
		return new RouterWrapper(base, router, corsOptions);
	}

	public static errorHandler(error) {
		const isObject = libx.isObject(error);
		const errMessage = error?.message ?? error;
		const msg = 'Error: ' + (!isObject ? (errMessage ?? 'Server Error') : JSON.stringify(error));
		const status = parseInt(error?.status ?? error?.statusCode ?? error?.code ?? error?.error?.code) || 500;
		console.error('Server error: ', error, status);
		return new Response(msg, { status })
	}

	public registerRoute(newBase: string, baseRouterInitializer: BaseRouterInitializer) {
		const route = baseRouterInitializer(`${this.base}${newBase}`);
		this.router.all(newBase + '/*', route.router.fetch);
		return this.router;
	};

	public fetchHandler(request: IRequest, ctx: TCtx) {
		return this.router.fetch(request, ctx)
			.then(json)
			.catch(RouterWrapper.errorHandler)
			.then((res) => this.corsify(res, request));
	}

	public catchNotFound() {
		this.router.all('*', () => error(404));
	}

	public createServerAdapter() {
		const ittyServer = createServerAdapter(this.fetchHandler.bind(this));
		return ittyServer;
	}
}