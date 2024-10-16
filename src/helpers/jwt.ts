import { libx } from 'libx.js/build/bundles/essentials.js';
import { Base64 } from 'js-base64'
import { network } from './EdgeNetwork.js';

class JwtHelper {
	private static cachedFirebasePublicKeys = <any>{};

	private static base64urlEncode(str): string {
		return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	}

	private static objectToBase64url(payload) {
		return this.arrayBufferToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
	}

	private static arrayBufferToBase64Url(buffer) {
		return btoa(String.fromCharCode(...new Uint8Array(buffer)))
			.replace(/=/g, '')
			.replace(/\+/g, '-')
			.replace(/\//g, '_');
	}

	private static hexToBuffer(hex: string) {
		const matches = hex.match(/[\da-f]{2}/gi) ?? []; // grab hex pairs
		const { buffer } = new Uint8Array(matches.map((h) => parseInt(h, 16)));
		return buffer;
	}

	private static base64UrlDecode = (str) => {
		return libx.Buffer.from(str, 'base64').toString('utf-8');
	};

	private static async getGooglePublicKey(kid) {
		if (this.cachedFirebasePublicKeys[kid]) return this.cachedFirebasePublicKeys[kid];
		const result: any = await (
			await fetch(
				"https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
				// 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
			)
		).json();

		const res = result.keys.find((key) => key.kid === kid);
		this.cachedFirebasePublicKeys[kid] = res;
		return res;
	}

	public static async generateSignedJWT(serviceAccount: any, scope: string, options?: Partial<Options>) {
		options = { ...new Options(), ...options };
		const pem = serviceAccount.private_key.replace(/\n/g, '');

		const pemHeader = '-----BEGIN PRIVATE KEY-----';
		const pemFooter = '-----END PRIVATE KEY-----';

		if (!pem.startsWith(pemHeader) || !pem.endsWith(pemFooter)) {
			throw new Error('Invalid service account private key');
		}

		const pemContents = pem.substring(pemHeader.length, pem.length - pemFooter.length);
		const buffer = Base64.toUint8Array(pemContents);
		const algorithm = {
			name: 'RSASSA-PKCS1-v1_5',
			hash: {
				name: 'SHA-256',
			},
		};
		const extractable = false;
		const privateKey = await crypto.subtle.importKey('pkcs8', buffer, algorithm, extractable, ["sign"]);

		const header = Base64.encodeURI(
			JSON.stringify({
				alg: 'RS256',
				typ: 'JWT',
				kid: serviceAccount.private_key_id,
			})
		);

		const iat = Math.floor(Date.now() / 1000);
		const exp = iat + options.exp;
		const payload = Base64.encodeURI(
			JSON.stringify({
				iss: serviceAccount.client_email,
				sub: serviceAccount.client_email,
				scope,
				aud: options.aud,
				exp,
				iat,
			})
		);

		const textEncoder = new TextEncoder();
		const inputArrayBuffer = textEncoder.encode(`${header}.${payload}`);
		const outputArrayBuffer = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, privateKey, inputArrayBuffer);
		const signature = Base64.fromUint8Array(new Uint8Array(outputArrayBuffer), true);

		return {
			header,
			payload,
			signature
		};
	}

	public static async generateToken(serviceAccount: any, scope: string, options?: Partial<Options>) {
		const signed = await this.generateSignedJWT(serviceAccount, scope, options);
		const token = `${signed.header}.${signed.payload}.${signed.signature}`;
		return token;
	}

	public static async generateOAuth(serviceAccount: any, scope: string, options?: Partial<Options>) {
		const token = await this.generateToken(serviceAccount, scope, options);
		return await this.jwtToOAuth(token);
	}

	private static async jwtToOAuth(signedJwt: string) {
		// Prepare the request to get an OAuth2 token
		const tokenRequest = {
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion: signedJwt
		};

		try {
			/*
			 // Make the request to Google's OAuth2 server
			 const response = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams(tokenRequest).toString(), {
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				}
			});
	
			// Extract and return the access token
			return response.data.access_token;
			*/

			// Make the request to Google's OAuth2 server
			const response = await network.httpPostJson('https://oauth2.googleapis.com/token', tokenRequest);
			// const response = await fetch('https://www.googleapis.com/oauth2/v4/token', {
			// 	method: 'POST',
			// 	headers: new Headers({
			// 		'Content-Type': 'application/json',
			// 	}),
			// 	body: JSON.stringify(tokenRequest),
			// });

			// Extract and return the access token
			const tmp = response as any;
			// const tmp = await response.json<any>();
			if (tmp.error) throw tmp;
			return tmp.access_token;
		} catch (error) {
			console.error('Error fetching OAuth2 token:', error);
			throw error;
		}
	}

	public static async makeRequest(url: string, serviceAccountObj: Object, scope: string, payload: any, options = {
		method: "POST",
		exHeaders: {}
	}) {
		const token = await JwtHelper.generateOAuth(serviceAccountObj, scope);

		libx.log.d('DBG: makeRequest: ', scope, token);
		const bqResp = await fetch(url, {
			method: options.method,
			body: payload ? JSON.stringify(payload) : null,
			headers: {
				"content-type": "application/json;charset=UTF-8",
				"Authorization": "Bearer " + token,
				...options.exHeaders
			}
		});

		// libx.log.i('DONE!', JSON.stringify(await this.gatherResponse(bqResp)))
		return bqResp;
	}

	public static async verifyFirebaseToken(token, expectAud): Promise<IFirebaseTokenPayload> {
		const dur = libx.Measurement.start();
		const expectIss = `https://securetoken.google.com/${expectAud}`;
		const tokenParts = token.split('.');
		const header = JSON.parse(atob(tokenParts[0]));
		const key = await this.getGooglePublicKey(header.kid);
		const payload = await this.verifyToken(key, token, expectAud, expectIss) as IFirebaseTokenPayload;

		libx.log.d(`verifyFirebaseToken: dur: ${dur.peek()}ms`);
		return payload;
	}

	public static async verifyToken(publicKey, token, expectAud, expectIss, checkExpiry = true): Promise<IJwtTokenPayload> {
		try {
			// const payload = this.decodeToken(token);
			const payload2 = this.decodeToken(token);

			if (expectAud && payload2.payload.aud != expectAud) {
				throw 'verifyToken: mismatched aud!';
			}
			if (expectIss && payload2.payload.iss != expectIss) {
				throw 'verifyToken: mismatched iss!';
			}

			const tokenParts = token.split('.');
			const alg = { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } };
			const key = await crypto.subtle.importKey('jwk', publicKey, alg, false, ['verify']);
			const isVerified = await crypto.subtle.verify(alg, key, this.parseBase64Url(tokenParts[2]), this.utf8ToUint8Array(`${tokenParts[0]}.${tokenParts[1]}`));

			if (checkExpiry && payload2.payload.exp <= Math.floor(Date.now() / 1000)) {
				throw 'verifyToken: expired!';
			}

			if (isVerified == false) {
				throw 'verifyToken: invalid token!';
			}

			return payload2.payload;
		} catch (error) {
			libx.log.e('Error verifying token:', error);
			throw error;
		}
	}

	public static decodeToken(idToken) {
		const [header, payload, signature] = idToken.split('.').map(part => this.base64UrlDecode(part));
		return {
			rawHeader: header,
			header: JSON.parse(header),
			payload: JSON.parse(payload),
			rawPayload: payload,
			signature: signature,
		};
	};

	private static parseBase64Url(url) {
		return new Uint8Array(Array.prototype.map.call(atob(url.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')), c => c.charCodeAt(0)))
	}

	private static utf8ToUint8Array(str) {
		return this.parseBase64Url(btoa(unescape(encodeURIComponent(str))))
	}

	private static decodeToken_2(token) {
		let raw = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
		switch (raw.length % 4) {
			case 0:
				break
			case 2:
				raw += '=='
				break
			case 3:
				raw += '='
				break
			default:
				throw new Error('Illegal base64url string!')
		}

		try {
			return JSON.parse(decodeURIComponent(escape(atob(raw))))
		} catch {
			return null
		}
	}
}

class Options {
	aud = 'https://oauth2.googleapis.com/token';
	exp = 3600;
}

interface IJwtTokenPayload {
	name: string;
	picture: string;
	iss: string;
	aud: string;
	auth_time: number,
	user_id: string;
	sub: string;
	iat: number,
	exp: number,
	email: string;
	email_verified: true,
}

export interface IFirebaseTokenPayload extends IJwtTokenPayload {
	firebase: {
		identities: any,
		sign_in_provider: string;
	}
}

export { JwtHelper };