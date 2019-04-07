import { Router } from 'express';
import couchbase from './database/couchbase'
import config from "./util/config";
import RidlWatcher from './services/RidlWatcher';
import QueryService from "./services/QueryService";
import AccountService from "./services/AccountService";
import {network} from "./services/NetworkService";
import Network from "./models/Network";

const bucket = couchbase('ridl');

QueryService.setBucket(bucket);
RidlWatcher.setBucket(bucket);
RidlWatcher.watch();



const routes = Router();



routes.get('/feed/:id/:page', async (req, res) => {
	const {id, page} = req.params;
	res.json(await QueryService.getFeed(id, page || 0));
});

routes.get('/recent/:page', async (req, res) => {
	const {page} = req.params;
	res.json(await QueryService.getRecentFeed(page || 0));
});

routes.get('/search/:terms/:page', async (req, res) => {
	const {terms, page} = req.params;
	res.json(await QueryService.search(terms, page || 0));
});

routes.get('/entity/:id', async (req, res) => {
	const {id} = req.params;
	res.json(await QueryService.getReputable(id));
});

routes.get('/create/:key', async (req, res) => {
	const {key} = req.params;
	res.json(await AccountService.createAccount(key));
});

routes.get('/faucet/:account', async (req, res) => {
	const {account} = req.params;
	res.json(await AccountService.faucet(account));
});

routes.get('/network', async (req, res) => {
	const n = Network.fromJson({
		host:'ridlnet.get-scatter.com',
		port:8888,
		protocol:'http',
		chainId:network.chainId
	});
	res.json(n);
});



routes.all('*', (req, res) => res.sendStatus(403));

export default routes;
