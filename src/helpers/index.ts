import { IRequest } from 'itty-router';
import { libx } from 'libx.js/build/bundles/essentials.js';
import { IFirebaseTokenPayload, JwtHelper } from './jwt.js';

export class Helpers {
	public constructor(public options?: Partial<ModuleOptions>) {
		this.options = { ...new ModuleOptions(), ...options };
		libx.log.v('Helpers:ctor');
	}

	public async verifyRequestToken(request: IRequest, expectedAud: string) {
		const token = request.headers.get('authorization')?.replace('Bearer ', '');
		if (token == null) throw 'verifyRequestToken: token is empty';
		const tokenPayload = await JwtHelper.verifyFirebaseToken(token, expectedAud);
		return tokenPayload;
	}

	public async gatherResponse(response: Response) {
		const { headers } = response;
		const contentType = headers.get("content-type") || "";
		if (contentType.includes("application/json")) {
			return JSON.stringify(await response.json());
		}
		else if (contentType.includes("image")) {
			return await this.readStream(response.body);
		}
		return await response.text();
	}

	public async readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
		const reader = stream.getReader();
		const chunks: Uint8Array[] = [];

		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				break;
			}

			chunks.push(value);
		}

		// Concatenate the chunks and decode them into a string using TextDecoder
		const concatenatedChunks = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
		let offset = 0;

		for (const chunk of chunks) {
			concatenatedChunks.set(chunk, offset);
			offset += chunk.length;
		}

		return concatenatedChunks;
	}
}

export class ModuleOptions {

}

export const helpers = new Helpers();