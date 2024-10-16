import { libx } from 'libx.js/build/bundles/essentials.js';
import { Route, Router, RouterType, error, json, cors, withParams, IRequest, text, ResponseHandler } from 'itty-router';
import { createServerAdapter } from '@whatwg-node/server';

type BaseRouterInitializer = (string) => { base: string; router: RouterType<IRequest, any[]> };

export class RouterWrapper<TCtx = any> {
	private static cors = cors({ origin: ['*'], allowMethods: ['POST'] });
	private static preflight = this.cors.preflight;
	private static corsify = this.cors.corsify;

	public constructor(public base: string, public router: RouterType<Request, [], any>) {

	}

	private static tryCors(response, request): Response {
		try {
			return this.corsify(response, request);
		} catch (err) {
			libx.log.w('tryCors: failed to perform CORS', err);
		}
	}

	public static getNew(base: string) {
		const router = Router({
			base,
			before: [this.preflight],
			catch: this.errorHandler,
			finally: [this.tryCors],
		});
		router.all('*', withParams);
		// router.finally.push(this.corsify);

		// router.all('*', () => error(404));

		return new RouterWrapper(base, router);
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
		// return this.router.fetch(request, ctx).then(json).then(RouterWrapper.corsify).catch(this.errorHandler);
		return this.router.fetch(request, ctx).then(json).catch(RouterWrapper.errorHandler);
	}

	public catchNotFound() {
		this.router.all('*', () => error(404));
	}

	public createServerAdapter() {
		const ittyServer = createServerAdapter(this.fetchHandler.bind(this));
		return ittyServer;
	}
}