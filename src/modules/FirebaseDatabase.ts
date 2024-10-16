import { network } from "../helpers/EdgeNetwork.js";
import { JwtHelper } from "../helpers/jwt.js";
import { FirebaseHelpers } from "../helpers/FirebaseHelpers.js";

interface FirebaseOptions {
	firebaseCreds: Object;
	databaseURL: string;
	// authToken: string;
	prefix: string;
}

interface FirebaseQueryParams {
	orderBy?: string;
	limitToFirst?: number;
	limitToLast?: number;
	startAt?: string | number;
	endAt?: string | number;
	equalTo?: string | number;
	shallow?: boolean;
}

type FirebaseMethod = 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE';

const scopes = [
	"https://www.googleapis.com/auth/userinfo.email",
	"https://www.googleapis.com/auth/firebase.database"
];

export const IncrementValue = { '.sv': { 'increment': 1 } };

class FirebaseDatabase {
	public static helpers = new FirebaseHelpers();

	public constructor(private options: FirebaseOptions) {
		// this.options = { ...new FirebaseOptions(), ...options };
	}

	private async request(
		path: string,
		method: FirebaseMethod,
		data?: any,
		params?: FirebaseQueryParams
	): Promise<any> {
		path = this._fixPath(path);
		const queryParams = new URLSearchParams();
		Object.keys(params || {}).forEach(key => {
			if (params[key] !== undefined) {
				queryParams.set(key, JSON.stringify(params[key]));
			}
		});

		const url = `${this.options.databaseURL}${path}.json${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
		const options: RequestInit = {
			method: method,
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${await this.getAuthToken()}`
			},
			body: data ? JSON.stringify(data) : null
		};

		try {
			const response = await fetch(url, options);
			if (!response.ok) {
				const errorBody = await response.text();
				throw new Error(`FirebaseDatabase:request(${method}): HTTP status code ${response.status}: ${errorBody}`);
			}
			return await response.json();
		} catch (error) {
			throw error;
		}
	}

	public async getAuthToken(_scopes: string[] = scopes) {
		return await JwtHelper.generateOAuth(this.options.firebaseCreds, _scopes.join(' '));
	}

	public async get<T = any>(path: string, params?: FirebaseQueryParams): Promise<T> {
		return this.request(path, 'GET', undefined, params);
	}

	public async set(path: string, data: any): Promise<any> {
		return this.request(path, 'PUT', data);
	}

	public async push(path: string, data: any): Promise<any> {
		const key = FirebaseDatabase.helpers.makeReverseKey();
		data = FirebaseDatabase.helpers._fillMissingFields(data, path, key);
		data = FirebaseDatabase.helpers._fixObj(data);
		return this.set(`${path}/${key}`, data);

		// return this.request(path, 'POST', data);
	}

	public async update(path: string, data: any): Promise<any> {
		return this.request(path, 'PATCH', data);
	}

	public async increment(path: string, delta = 1): Promise<any> {
		return await this.set(path, IncrementValue);
	}

	public async delete(path: string): Promise<any> {
		return this.request(path, 'DELETE');
	}

	public _fixPath(path: string) {
		if (this.options.prefix == null) return path;
		if (path.startsWith(this.options.prefix)) return path;
		if (path.startsWith('.')) return path;
		if (!path.startsWith('/') && !this.options.prefix.endsWith('/')) path = '/' + path;
		return this.options.prefix + path;
	}
}

export default FirebaseDatabase;