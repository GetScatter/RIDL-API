import "isomorphic-fetch"
import {network} from "./NetworkService";
import ridl from "ridl";
import {buildQuery} from "../database/couchbase";
const NodeWatcher = require('watcheosio');

let bucket;

let latestBlock = null;
const setLatestBlock = async num => {
	if(num < 0) return;
	if(await getLatestBlock() > num) return;
	latestBlock = num;
	return bucket.upsert('head', {num})
};


const queue = [];

export const getLatestBlock = async () => {
	if(latestBlock === null) latestBlock = await bucket.get('head').then(x => x.value.num).catch(() => 1);
	if(latestBlock < 0) latestBlock = 1;
	return latestBlock;
};

let settingLatest = false;
let lastSaveTime = 0;
export const blockTracker = async (current, head) => {
	// console.log(`Current block: ${current} | Head block: ${head} | Blocks behind: ${head - current} | ${new Date().toUTCString()}`);
	if(settingLatest || lastSaveTime + (1000*5) > +new Date() || queue.length) return;
	settingLatest = true;
	await setLatestBlock(current);
	lastSaveTime = +new Date();
	settingLatest = false;
}

const getParentId = async data => {
	if(data.parent.indexOf('id::') > -1){
		return data.parent.split('::')[1];
	}

	if(data.parent.indexOf('fingerprint::') > -1){
		let [_, entity, type, network] = data.parent.split('::');
		if(network) network = data.parent.split(type+'::')[1] || 0;
		const parent = await ridl.reputation.searchByFingerprint(type, entity, network);
		return parent ? parent.id : 0;
	}

	return 0;
};

let queueTimeout;
const checkQueue = async () => {
	clearTimeout(queueTimeout);

	if(queue.length) await processQueue();
	queueTimeout = setTimeout(() => {
		if(queue.length) checkQueue();
	}, 200);
};

const processQueue = async () => {
	if(!queue.length) return;
	const {key, payload} = queue.shift();
	const {transaction_id, data, action, block_num} = payload;
	console.log(`Action: ${action} | ${data.entity || data.username} | Block: ${block_num} | Latest: ${latestBlock}`);

	if(action === 'repute'){
		let reputable;
		const parentId = await getParentId(data);

		if(data.id === 0){
			reputable = await ridl.reputation.searchByFingerprint(data.type, data.entity, data.network, parentId);
			if(!reputable) return;
			data.id = reputable.id;
		} else {
			reputable = await ridl.reputation.getEntity(data.id);
		}

		data.fragments = data.fragments.map(frag => {
			const up = parseFloat(frag.up.split(' ')[0]);
			const down = parseFloat(frag.down.split(' ')[0]);
			const rep = parseFloat(up > 0 ? up : -down).toFixed(4);
			return {
				rep,
				fingerprint:frag.fingerprint,
				type:frag.type,
			}
		});

		const clone = reputable.clone();
		clone.total_reputes = clone.reputation.total_reputes;
		delete clone.parent;
		delete clone.reputation;

		await bucket.upsert(`reputable:${reputable.id}`, Object.assign({
			docType:'reputable',
			entity:data.entity,
		}, clone));

		if(!await bucket.exists(`reputable:${parentId}`)){
			const parent = await ridl.reputation.getEntity(parentId);
			parent.total_reputes = 0;
			delete parent.parent;
			delete parent.reputation;

			await bucket.upsert(`reputable:${parentId}`, Object.assign({docType:'reputable'}, parent));
		}

		delete data.parent;
		delete data.network;
	}

	if(action === 'identify' || action === 'claim'){
		const identity = await ridl.identity.get(data.username);
		if(!identity) return;
		data.id = identity.id;
	}

	const json = Object.assign(data, {tx:transaction_id, actionType:action, timestamp:+new Date(), docType:'action'});
	await bucket.upsert(key, json);
	await setLatestBlock(block_num);
	return true;
}

const cache = async payload => {
	const key = `tx:${payload.transaction_id}`;

	if(await bucket.exists(key)) return;

	if(queue.find(x => x.key === key)) return;
	queue.push({ key, payload });
	checkQueue();
};

const deleteAll = async data => {
	if(await getLatestBlock() > data.block_num) return;
	await bucket.query(buildQuery(`DELETE FROM ridl WHERE docType = 'action'`));
	await bucket.query(buildQuery(`DELETE FROM ridl WHERE docType = 'reputable'`));
	return true;
}

const parsers = {
	"ridlridlridl::repute":cache,
	"ridlridlridl::identify":cache,
	"ridlridlridl::claim":cache,
	"ridlridlridl::clean":deleteAll,
}


const options = {
	startingBlock:1,
	interval:2,
	endpoints:[ network.fullhost(), ],
	blockTracker
}








export default class RidlWatcher {

    static setBucket(_b){
        bucket = _b;
    }

    static async watch(){
    	let startingBlock = await getLatestBlock();

    	const chainInfo = await fetch(`${network.fullhost()}/v1/chain/get_info`).then(x => x.json()).catch(() => null);
    	if(!chainInfo) throw new Error(`Can't get chain info`);

    	if(startingBlock > parseInt(chainInfo.head_block_num)){
    		await deleteAll({block_num:startingBlock});
    		await bucket.upsert('head', {num:1})
		    startingBlock = 1;
	    }

    	options.startingBlock = startingBlock;
	    const watcher = new NodeWatcher(parsers, options);
	    watcher.start();
    }

}






