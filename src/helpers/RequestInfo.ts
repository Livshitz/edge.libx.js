import { geolocation } from '@vercel/edge';
import { IRequest } from 'itty-router';
import { libx } from 'libx.js/build/bundles/essentials.js';
import UAParser from 'ua-parser-js';

export interface IRequestInfo {
    deviceType;
    clientIP;
    ip;
    country;
    region;
    city;
    'cf.tlsClientAuth';
    'cf.tlsExportedAuthenticator';
    'device.vendor';
    'device.model';
    'device.type';
    'browser.name';
    'browser.version';
    'browser.major';
    'engine.name';
    'engine.version';
    'os.name';
    'os.version';
    'cpu.architecture';
}

export class RequestInfo {
    public constructor(public options?: Partial<ModuleOptions>) {
        libx.log.v('RequestInfo:ctor: ');
        this.options = { ...new ModuleOptions(), ...options };
    }

    public static async process(request: IRequest): Promise<IRequestInfo> {
        const reqCf = { ...request.cf };

        const clientIP = request.headers.get('CF-Connecting-IP');
        const device = request.headers.get('CF-Device-Type');
        const ip = request.headers.get('x-real-ip');
        const country = request.headers.get('X-Vercel-IP-Country');
        const region = request.headers.get('X-Vercel-IP-Country-Region');
        let city = request.headers.get('X-Vercel-IP-City');
        const userAgent = request.headers.get('User-Agent') || '';
        let parser = new UAParser(userAgent);

        if (city == null) city = geolocation(request).city;

        reqCf.tlsClientAuth = JSON.stringify(reqCf.tlsClientAuth);
        reqCf.tlsExportedAuthenticator = JSON.stringify(reqCf.tlsExportedAuthenticator);

        let parsed = parser.getResult();
        delete parsed.ua;
        let ret = {
            clientIP,
            cf: reqCf,
            device,
            ip,
            country,
            region,
            city,
            ...parsed,
            deviceType: this.getDeviceType(userAgent),
        };

        ret = libx.flatterObjectToDotNotation(ret);

        return ret;
    }

    private static getDeviceType(ua: string) {
        if (/mobile/i.test(ua)) {
            return 'Mobile';
        } else if (/tablet/i.test(ua)) {
            return 'Tablet';
        } else {
            return 'Desktop';
        }
    }
}

export class ModuleOptions {}
