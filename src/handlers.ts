import { Utilities } from './utils';
import { Request, Response } from 'express';
import { Fetcher } from './fetcher';
import { invalidUserSvg } from './svgs';
import { ParsedQs, UserDetails } from './interfaces/interface';

const getProfileQuery = (req: Request): ParsedQs | null => {
    const requestedUsername = req.query.username;
    if (
        requestedUsername &&
        String(requestedUsername).toLowerCase() !== 'zedingzhang'
    ) {
        return null;
    }

    const darkMode = String(req.query.theme).toLowerCase() === 'dark';

    return {
        username: 'ZedingZhang',
        bg_color: '00000000',
        color: darkMode ? '8B949E' : '57606A',
        title_color: darkMode ? '58A6FF' : '0969DA',
        line: darkMode ? '58A6FF' : '0969DA',
        point: darkMode ? '58A6FF' : '0969DA',
        area_color: darkMode ? '1F6FEB' : '54AEFF',
        area: true,
        hide_border: true,
        hide_title: true,
        radius: 8,
        height: 300,
        days: '31',
    };
};

export class Handlers {
    public getRoot(_req: Request, res: Response) {
        res.send(`<h1>Zeding Zhang's GitHub Activity Graph 📈</h1>`);
    }

    public async getGraph(req: Request, res: Response) {
        try {
            const profileQuery = getProfileQuery(req);
            if (!profileQuery) {
                res.status(404).set({
                    'Cache-Control': 'no-store, max-age=0',
                    'Content-Type': 'image/svg+xml',
                });
                res.send(invalidUserSvg('This deployment only serves ZedingZhang.'));
                return;
            }

            const utils = new Utilities(profileQuery);

            const fetcher = new Fetcher(utils.username);
            const queryOptions = utils.queryOptions();
            const fetchCalendarData = await fetcher.fetchContributions(
                utils.queryOptions().days,
                queryOptions.from,
                queryOptions.to,
            );

            const { finalGraph, header } = await utils.buildGraph(fetchCalendarData);
            utils.setHttpHeader(res, header.maxAge);

            res.status(200).send(finalGraph);
        } catch (error) {
            res.setHeader('Cache-Control', 'no-store, max-age=0');
            res.set('Content-Type', 'image/svg+xml');
            res.send(invalidUserSvg('Something unexpected happened 💥'));
        }
    }

    public async getData(req: Request, res: Response) {
        try {
            const utils = new Utilities(req.query);

            const fetcher = new Fetcher(utils.username);
            const fetchCalendarData: UserDetails | string = await fetcher.fetchContributions(
                utils.queryOptions().days,
            );

            if (typeof fetchCalendarData === 'object') {
                res.status(200).send(fetchCalendarData);
            } else {
                res.send(invalidUserSvg(fetchCalendarData));
            }
        } catch (error) {
            res.send(invalidUserSvg('Something unexpected happened 💥'));
        }
    }
}
