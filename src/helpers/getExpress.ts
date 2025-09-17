import bodyParser from 'body-parser';
import express, { Express, Request, Response } from "express";
import cors from 'cors';

export function getExpress() {
    let app: Express = express();

    app.set('json spaces', 4);

    var rawBodySaver = function (req, res, buf, encoding) {
        if (buf && buf.length) {
            req.rawBody = buf.toString(encoding || 'utf8');
        }
    };

    // Increase payload limits for audio uploads (STT) - up to 25MB to match OpenAI's limit
    const payloadLimit = '25mb';

    app.use(bodyParser.json({ verify: rawBodySaver, limit: payloadLimit }));
    app.use(bodyParser.urlencoded({ verify: rawBodySaver, extended: true, limit: payloadLimit }));
    app.use(bodyParser.raw({ verify: rawBodySaver, type: '*/*', limit: payloadLimit }));

    app.use(cors());

    const router = express.Router();

    return { app, router };
}
