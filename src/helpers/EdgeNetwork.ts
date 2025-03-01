import { libx } from "libx.js/build/bundles/essentials.js";

class EdgeNetwork {
	public async fetch(url: string, method: "GET" | "POST" | any, options?: RequestInit) {
		url = this.cleanUrl(url);
		const p = libx.newPromise();
		const _p = fetch(url, {
			method,
			// credentials: "include",
			//@ts-ignore
			// withCredentials: true,
			redirect: "follow",
			...options,
		});

		_p.catch(err=>{
			return p.reject(err);
		});
		_p.then(async res=>{
			if (res.status < 200 || res.status > 299) {
				let body = null;
				try {
					body = await res.json(); 
				} catch {}
				const msg = `Fetch error: "${res?.status} - ${body?.error?.message ?? body?.message ?? res?.statusText}"`;
				libx.log.w(msg, body);
				return p.reject(msg); 
			}
			else p.resolve(res);
		});

		return p;
	}
	public async httpGet(url: string, options?: RequestInit) {
		return await this.fetch(url, 'GET', options);
	}

	public async httpGetText(url: string, options?: RequestInit) {
		const res = await this.httpGet(url, options);
		return await res.text();
	}

	public async httpGetJson<T=any>(url: string, options?: RequestInit): Promise<T> {
		const res = await this.httpGet(url, options);
		return await res.json();
	}

    public async httpPost(url: string, data: any, _options?: any) {
		const res = await this.fetch(url, "POST", {
			body: data,
			headers: {
				..._options?.headers,
				// 'content-type': 'application/json',
			},
			..._options,
		});
		return res;
	}

    public async httpPostText(url: string, data: any, _options?: {}) {
		const res = await this.httpPost(url, data, _options);
		return res.text();
	}

    public async httpPostJson(url: string, data: any, _options?: {}) {
		const res = await this.httpPost(url, JSON.stringify(data), {
			headers: {
				// 'content-type': 'application/json',
				// 'content-length': '0',
			},
			withCredentials: true,
			..._options 
		});
		// const res = await this.fetch(url, "POST", {
		// 	body: JSON.stringify(data),
		// 	headers: {
		// 		'content-type': 'application/json',
		// 	},
		// 	..._options,
		// });

		return res.json();
	}

	public fixUrl(url: string, prefixUrl?: string) {
        var sep = '://';
        var pos = url.indexOf(sep);
        if (pos > -1) {
            var startOfUrl = url.slice(0, pos);
            var restOfUrl = url.slice(pos + 3);
            restOfUrl = restOfUrl.replace(/([^:]\/)\/+/g, '$1');
            url = startOfUrl + sep + restOfUrl;
        } else {
            url = url.replace(/([^:]\/)\/+/g, '$1');
        }

        prefixUrl = prefixUrl || '';

        var isAbsoluteUrl = pos > -1; // url.contains("//");
        url = this.cleanUrl((!isAbsoluteUrl ? prefixUrl : '') + url);

        return url;
    }

	public cleanUrl(url: string) {
        if (url == null) return null;
        //return url.replace('/(?<!http:)\/\//g', '/');
        return url.replace(new RegExp('([^:]/)/+', 'g'), '$1');
    }
	
}

export const network = new EdgeNetwork();